require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMessagePage(args) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(args.title)}</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 700px; margin: 50px auto; padding: 20px; }
        .panel { background: ${args.bg || '#fff3cd'}; color: ${args.fg || '#856404'}; padding: 20px; border-radius: 6px; }
        a { color: inherit; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="panel">
        <h2>${escapeHtml(args.heading)}</h2>
        <p>${args.message}</p>
        ${args.linkHref ? `<p><a href="${escapeHtml(args.linkHref)}">${escapeHtml(args.linkLabel || 'Return')}</a></p>` : ''}
        ${args.error ? `<p><small>Error: ${escapeHtml(args.error)}</small></p>` : ''}
      </div>
    </body>
    </html>
  `;
}

async function getPortalUserByEmail(email) {
  const { data, error } = await supabase
    .from('portal_users')
    .select('id, email, domain_id')
    .eq('email', email)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getLatestReportForUser(userId) {
  const { data, error } = await supabase
    .from('reports')
    .select('id, owner_user_id, assessment_id, report_level, generated_at, pdf_storage_bucket, pdf_storage_path, pdf_file_name, pdf_mime_type, is_available')
    .eq('owner_user_id', userId)
    .eq('is_available', true)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function getAssessmentMeta(assessmentId) {
  if (!assessmentId) return null;

  const { data, error } = await supabase
    .from('assessments')
    .select('assessment_data')
    .eq('id', assessmentId)
    .maybeSingle();

  if (error) {
    console.warn('Assessment metadata lookup failed:', error.message);
    return null;
  }

  return data?.assessment_data || null;
}

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Report Viewer</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .info { background: #e9ecef; padding: 20px; border-radius: 4px; }
      </style>
    </head>
    <body>
      <h1>Welcome to Report Viewer</h1>
      <div class="info">
        <p>This application should be accessed from your Topline member dashboard.</p>
        <p>Please click the "View My Report" button in Topline to continue.</p>
      </div>
    </body>
    </html>
  `);
});

app.get('/report', async (req, res) => {
  const rawEmail = req.query.email;
  const email = String(rawEmail || '').trim().toLowerCase();
  const returnUrl = process.env.TOPLINE_RETURN_URL || 'javascript:history.back()';

  if (!email) {
    return res.status(400).send(renderMessagePage({
      title: 'Error',
      heading: 'Missing Email Address',
      message: 'No email address was provided. Please access this from your Topline member dashboard.',
      bg: '#f8d7da',
      fg: '#721c24',
      linkHref: returnUrl,
      linkLabel: 'Return to Dashboard',
    }));
  }

  try {
    console.log('Loading secure report for email:', email);

    const user = await getPortalUserByEmail(email);
    if (!user) {
      return res.status(404).send(renderMessagePage({
        title: 'Report Not Found',
        heading: 'Report Not Found',
        message: `No active portal user was found for <strong>${escapeHtml(email)}</strong>.`,
        linkHref: returnUrl,
        linkLabel: 'Return to Dashboard',
      }));
    }

    const report = await getLatestReportForUser(user.id);
    if (!report) {
      return res.status(404).send(renderMessagePage({
        title: 'Report Not Found',
        heading: 'Report Not Found',
        message: `No report is currently available for <strong>${escapeHtml(email)}</strong>.`,
        linkHref: returnUrl,
        linkLabel: 'Return to Dashboard',
      }));
    }

    if (!report.pdf_storage_path) {
      return res.status(409).send(renderMessagePage({
        title: 'Report Not Available',
        heading: 'Report Not Available Yet',
        message: 'Your report record exists, but the secure PDF has not been attached yet. Please check back shortly.',
        linkHref: returnUrl,
        linkLabel: 'Return to Dashboard',
      }));
    }

    const assessmentMeta = await getAssessmentMeta(report.assessment_id);
    const fullName = assessmentMeta?.full_name || assessmentMeta?.fullName || user.email;
    const company = assessmentMeta?.company || 'N/A';
    const generatedAt = report.generated_at ? new Date(report.generated_at).toLocaleString() : 'Unknown';

    const pdfUrl = `/report/pdf?email=${encodeURIComponent(email)}&reportId=${encodeURIComponent(report.id)}`;

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Report - ${escapeHtml(fullName)}</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .report-wrapper { max-width: 1280px; margin: 0 auto; background: white; padding: 24px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .report-meta { background: #e9ecef; padding: 10px 15px; border-radius: 4px; margin-bottom: 16px; font-size: 14px; color: #444; }
          .pdf-frame { width: 100%; height: 80vh; border: 1px solid #d1d5db; border-radius: 6px; }
          .done-button-container { text-align: center; padding: 24px 0 8px 0; }
          .done-button { background: #28a745; color: white; padding: 14px 36px; border-radius: 4px; text-decoration: none; display: inline-block; font-weight: bold; }
          .done-button:hover { background: #218838; }
        </style>
      </head>
      <body>
        <div class="report-wrapper">
          <div class="report-meta">
            Report for: <strong>${escapeHtml(fullName)}</strong> |
            Company: <strong>${escapeHtml(company)}</strong> |
            Level: <strong>${escapeHtml(report.report_level)}</strong> |
            Generated: <strong>${escapeHtml(generatedAt)}</strong>
          </div>

          <iframe class="pdf-frame" src="${pdfUrl}" title="Secure PDF report"></iframe>

          <div class="done-button-container">
            <a href="${escapeHtml(returnUrl)}" class="done-button">Done - Return to Dashboard</a>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error loading report:', error);
    return res.status(500).send(renderMessagePage({
      title: 'Error',
      heading: 'Error Loading Report',
      message: 'Unable to retrieve your report. Please try again or contact support.',
      bg: '#f8d7da',
      fg: '#721c24',
      error: error.message || String(error),
    }));
  }
});

app.get('/report/pdf', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  const reportId = String(req.query.reportId || '').trim();

  if (!email || !reportId) {
    return res.status(400).send('Missing email or reportId');
  }

  try {
    const user = await getPortalUserByEmail(email);
    if (!user) {
      return res.status(404).send('User not found');
    }

    const { data: report, error } = await supabase
      .from('reports')
      .select('id, owner_user_id, pdf_storage_bucket, pdf_storage_path, pdf_file_name, pdf_mime_type, is_available')
      .eq('id', reportId)
      .eq('owner_user_id', user.id)
      .eq('is_available', true)
      .maybeSingle();

    if (error) throw error;
    if (!report) return res.status(404).send('Report not found');

    const bucket = report.pdf_storage_bucket || process.env.SUPABASE_REPORTS_BUCKET;
    const path = report.pdf_storage_path;

    if (!bucket || !path) {
      return res.status(409).send('Secure PDF is not available yet');
    }

    const { data: file, error: downloadError } = await supabase.storage
      .from(bucket)
      .download(path);

    if (downloadError || !file) {
      console.error('PDF download error:', downloadError);
      return res.status(502).send('Failed to load report PDF');
    }

    const filename = report.pdf_file_name || `report-${report.id}.pdf`;
    const contentType = report.pdf_mime_type || file.type || 'application/pdf';
    const bytes = Buffer.from(await file.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    return res.status(200).send(bytes);
  } catch (error) {
    console.error('Error streaming PDF:', error);
    return res.status(500).send('Failed to stream secure PDF');
  }
});

app.get('/healthz', (req, res) => {
  res.send('OK');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Base URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
  console.log(`Supabase configured: ${process.env.SUPABASE_URL ? 'Yes' : 'No'}`);
});
