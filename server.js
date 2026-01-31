require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Routes

// Home/Landing page
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

// Report entry point - receives email from Topline
app.get('/report', async (req, res) => {
  const email = req.query.email;
  
  if (!email) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .error { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>Missing Email Address</h2>
          <p>No email address was provided. Please access this from your Topline member dashboard.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  try {
    console.log('Fetching report for email:', email);
    
    // Query Supabase for the most recent report for this email
    const { data, error } = await supabase
      .from('readiness_reports')
      .select('id, full_name, company, email, report_html, created_at, report_type')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error) {
      console.error('Supabase error:', error);
      
      // If no report found
      if (error.code === 'PGRST116') {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Report Not Found</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .error { background: #fff3cd; color: #856404; padding: 20px; border-radius: 4px; }
              a { color: #856404; }
            </style>
          </head>
          <body>
            <div class="error">
              <h2>Report Not Found</h2>
              <p>No report was found for email: <strong>${email}</strong></p>
              <p>Please contact support if you believe this is an error.</p>
              <p><a href="${process.env.TOPLINE_RETURN_URL || 'javascript:history.back()'}">Return to Dashboard</a></p>
            </div>
          </body>
          </html>
        `);
      }
      
      throw new Error(error.message);
    }
    
    if (!data || !data.report_html) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Report Not Available</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .error { background: #fff3cd; color: #856404; padding: 20px; border-radius: 4px; }
            a { color: #856404; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>Report Not Available</h2>
            <p>Your report is being generated. Please check back shortly.</p>
            <p><a href="${process.env.TOPLINE_RETURN_URL || 'javascript:history.back()'}">Return to Dashboard</a></p>
          </div>
        </body>
        </html>
      `);
    }
    
    // Display the report
    const reportHTML = generateReport(data);
    res.send(reportHTML);
    
  } catch (error) {
    console.error('Error loading report:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .error { background: #f8d7da; color: #721c24; padding: 20px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="error">
          <h2>Error Loading Report</h2>
          <p>Unable to retrieve your report. Please try again or contact support.</p>
          <p><small>Error: ${error.message}</small></p>
        </div>
      </body>
      </html>
    `);
  }
});

// Function to generate the report HTML wrapper
function generateReport(reportData) {
  const returnUrl = process.env.TOPLINE_RETURN_URL || 'https://yourtoplinesite.com/thank-you';
  
  // The report_html field contains the complete HTML report
  // We'll wrap it with a Done button
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Report - ${reportData.full_name}</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          margin: 0; 
          padding: 20px; 
          background: #f5f5f5; 
        }
        .report-wrapper { 
          max-width: 1200px; 
          margin: 0 auto; 
          background: white;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .done-button-container { 
          text-align: center; 
          padding: 30px 20px 20px 20px; 
          border-top: 2px solid #e9ecef;
          margin-top: 30px;
        }
        .done-button { 
          background: #28a745; 
          color: white; 
          padding: 15px 40px; 
          border: none; 
          border-radius: 4px; 
          cursor: pointer; 
          font-size: 16px; 
          text-decoration: none; 
          display: inline-block;
          font-weight: bold;
        }
        .done-button:hover { 
          background: #218838; 
        }
        .report-meta {
          background: #e9ecef;
          padding: 10px 15px;
          border-radius: 4px;
          margin-bottom: 20px;
          font-size: 14px;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="report-wrapper">
        <div class="report-meta">
          Report for: <strong>${reportData.full_name}</strong> | 
          Company: <strong>${reportData.company || 'N/A'}</strong> | 
          Type: <strong>${reportData.report_type || 'Standard'}</strong> | 
          Generated: <strong>${new Date(reportData.created_at).toLocaleDateString()}</strong>
        </div>
        
        ${reportData.report_html}
        
        <div class="done-button-container">
          <a href="${returnUrl}" class="done-button">Done - Return to Dashboard</a>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.send('OK');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Base URL: ${process.env.BASE_URL || 'http://localhost:' + PORT}`);
  console.log(`Supabase configured: ${process.env.SUPABASE_URL ? 'Yes' : 'No'}`);
});
