require('dotenv').config();
const express = require('express');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 3600000 // 1 hour
  }
}));

// Middleware to check if user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.status(403).send('Access denied. Invalid or missing authentication.');
}

// Function to fetch member data from Topline API
async function fetchMemberData(contactId) {
  const token = process.env.TOPLINE_PRIVATE_TOKEN;
  
  if (!token) {
    throw new Error('TOPLINE_PRIVATE_TOKEN not configured');
  }
  
  try {
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/${contactId}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Version': '2021-07-28'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching member data:', error);
    throw error;
  }
}

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

// Report entry point - receives contact ID from Topline
app.get('/report', async (req, res) => {
  const contactId = req.query.contact_id || req.query.user_id || req.query.id;
  
  if (!contactId) {
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
          <h2>Missing Contact Information</h2>
          <p>No contact ID was provided. Please access this from your Topline member dashboard.</p>
        </div>
      </body>
      </html>
    `);
  }
  
  try {
    // Fetch member data from Topline API
    const memberData = await fetchMemberData(contactId);
    
    // Store user info in session
    req.session.user = {
      id: memberData.contact?.id || contactId,
      firstName: memberData.contact?.firstName || 'Member',
      lastName: memberData.contact?.lastName || '',
      email: memberData.contact?.email || 'Not provided',
      phone: memberData.contact?.phone || 'Not provided'
    };
    
    // Generate and show the report
    const reportHTML = generateReport(req.session.user, memberData);
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
          <p>Unable to retrieve your information. Please try again or contact support.</p>
          <p><small>Error: ${error.message}</small></p>
        </div>
      </body>
      </html>
    `);
  }
});

// Function to generate the report HTML
function generateReport(user, fullData) {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  
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
        <h1>Your Personal Report</h1>
        
        <div class="user-info">
          <p><strong>Name:</strong> ${fullName}</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Phone:</strong> ${user.phone}</p>
          <p><strong>Member ID:</strong> ${user.id}</p>
        </div>
        
        <div class="report-content">
          <h2>Report Details</h2>
          
          <div class="data-section">
            <h3>Account Information</h3>
            <p>Report generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
            <p>Status: Active Member</p>
          </div>
          
          <div class="data-section">
            <h3>Your Data</h3>
            <p>This is where you would display personalized information, charts, statistics, or other report content specific to ${user.firstName}.</p>
            
            <!-- You can access all the data from fullData.contact here -->
            <!-- Example: Add custom fields, tags, notes, etc. -->
          </div>
          
          <div class="data-section">
            <h3>Additional Information</h3>
            <ul>
              <li>Member since: 2024</li>
              <li>Account type: Standard</li>
              <li>Last updated: ${new Date().toLocaleDateString()}</li>
            </ul>
          </div>
        </div>
        
        <a href="${process.env.TOPLINE_RETURN_URL || 'javascript:window.close();'}" class="done-button">Done - Return to Dashboard</a>
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
  console.log(`Topline token configured: ${process.env.TOPLINE_PRIVATE_TOKEN ? 'Yes' : 'No'}`);
});
