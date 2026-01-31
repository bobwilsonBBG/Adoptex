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
    
    // Query Supabase for the report
    const { data, error } = await supabase
      .from(process.env.SUPABASE_TABLE_NAME || 'reports')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error) {
      console.error('Supabase error:', error);
      throw new Error(error.message);
    }
    
    if (!data) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Report Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .error { background: #fff3cd; color: #856404; padding: 20px; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>Report Not Found</h2>
            <p>No report was found for email: ${email}</p>
            <p>Please contact support if you believe this is an error.</p>
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

// Function to generate the report HTML
function generateReport(reportData) {
  const returnUrl = process.env.TOPLINE_RETURN_URL || 'https://yourtoplinesite.com/thank-you';
  
  // If the database stores complete HTML in a field, use it directly
  if (reportData.html_content) {
    // Wrap the stored HTML with Done button
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Your Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
          .report-wrapper { max-width: 1000px; margin: 0 auto; }
          .done-button-container { text-align: center; padding: 20px; background: white; margin-top: 20px; border-radius: 8px; }
          .done-button { background: #28a745; color: white; padding: 12px 30px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; text-decoration: none; display: inline-block; }
          .done-button:hover { background: #218838; }
        </style>
      </head>
      <body>
        <div class="report-wrapper">
          ${reportData.html_content}
          
          <div class="done-button-container">
            <a href="${returnUrl}" class="done-button">Done - Return to Dashboard</a>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  // Otherwise, build the report from individual fields
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Your Report</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 30px auto; padding: 20px; background: #f5f5f5; }
        .report-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
        .user-info { background: #e9ecef; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .user-info p { margin: 8px 0; }
        .report-content { margin: 20px 0; line-height: 1.6; }
        .data-section { margin: 20px 0; }
        .data-section h3 { color: #555; margin-bottom: 10px; }
        .done-button { background: #28a745; color: white; padding: 12px 30px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin-top: 20px; text-decoration: none; display: inline-block; }
        .done-button:hover { background: #218838; }
      </style>
    </head>
    <body>
      <div class="report-container">
        <h1>${reportData.title || 'Your Personal Report'}</h1>
        
        <div class="user-info">
          <p><strong>Email:</strong> ${reportData.email}</p>
          <p><strong>Name:</strong> ${reportData.name || reportData.first_name + ' ' + reportData.last_name || 'Member'}</p>
          <p><strong>Generated:</strong> ${new Date(reportData.created_at || Date.now()).toLocaleDateString()}</p>
        </div>
        
        <div class="report-content">
          ${reportData.content || reportData.report_content || '<p>Report content goes here.</p>'}
        </div>
        
        <a href="${returnUrl}" class="done-button">Done - Return to Dashboard</a>
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
