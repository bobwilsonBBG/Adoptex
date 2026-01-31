require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');

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
  res.redirect('/login');
}

// Store OIDC client globally (will be initialized on startup)
let oidcClient = null;

// Initialize OIDC client
async function initializeOIDC() {
  if (!process.env.TOPLINE_ISSUER) {
    console.log('OIDC not configured - skipping initialization');
    return;
  }
  
  try {
    const issuer = await Issuer.discover(process.env.TOPLINE_ISSUER);
    oidcClient = new issuer.Client({
      client_id: process.env.TOPLINE_CLIENT_ID,
      client_secret: process.env.TOPLINE_CLIENT_SECRET,
      redirect_uris: [`${process.env.BASE_URL}/auth/callback`],
      response_types: ['code']
    });
    console.log('OIDC client initialized successfully');
  } catch (error) {
    console.error('Failed to initialize OIDC:', error);
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
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background: #0056b3; }
      </style>
    </head>
    <body>
      <h1>Welcome to Report Viewer</h1>
      <p>Please log in to view your report.</p>
      <form action="/login" method="get">
        <button type="submit">Log In with Topline</button>
      </form>
    </body>
    </html>
  `);
});

// Start login flow
app.get('/login', async (req, res) => {
  if (!oidcClient) {
    return res.send('SSO not configured yet. Please contact administrator.');
  }
  
  const code_verifier = generators.codeVerifier();
  const code_challenge = generators.codeChallenge(code_verifier);
  const state = generators.state();
  
  req.session.code_verifier = code_verifier;
  req.session.state = state;
  
  const authUrl = oidcClient.authorizationUrl({
    scope: 'openid email profile',
    code_challenge,
    code_challenge_method: 'S256',
    state
  });
  
  res.redirect(authUrl);
});

// SSO callback endpoint
app.get('/auth/callback', async (req, res) => {
  try {
    const params = oidcClient.callbackParams(req);
    
    const tokenSet = await oidcClient.callback(
      `${process.env.BASE_URL}/auth/callback`,
      params,
      { 
        code_verifier: req.session.code_verifier,
        state: req.session.state 
      }
    );
    
    const claims = tokenSet.claims();
    
    req.session.user = {
      id: claims.sub,
      email: claims.email,
      name: claims.name || claims.email
    };
    
    res.redirect('/report');
  } catch (error) {
    console.error('Callback error:', error);
    res.send('Login failed. Please try again.');
  }
});

// Report page (protected)
app.get('/report', ensureAuthenticated, (req, res) => {
  const user = req.session.user;
  
  // This is where you would fetch or generate the actual report
  // For now, we'll show a sample report
  const reportHTML = generateReport(user);
  
  res.send(reportHTML);
});

// Function to generate the report HTML
function generateReport(user) {
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
        .report-content { margin: 20px 0; line-height: 1.6; }
        .done-button { background: #28a745; color: white; padding: 12px 30px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin-top: 20px; }
        .done-button:hover { background: #218838; }
      </style>
    </head>
    <body>
      <div class="report-container">
        <h1>Your Personal Report</h1>
        
        <div class="user-info">
          <strong>Member:</strong> ${user.name}<br>
          <strong>Email:</strong> ${user.email}
        </div>
        
        <div class="report-content">
          <h2>Report Details</h2>
          <p>This is where your personalized report content will appear.</p>
          <p>User ID: ${user.id}</p>
          
          <!-- Add your actual report data here -->
          <p><strong>Sample Data:</strong></p>
          <ul>
            <li>Report generated: ${new Date().toLocaleDateString()}</li>
            <li>Status: Active</li>
            <li>Member since: 2024</li>
          </ul>
        </div>
        
        <form action="/done" method="post">
          <button type="submit" class="done-button">Done - Return to Topline</button>
        </form>
      </div>
    </body>
    </html>
  `;
}

// Handle "Done" button - redirect back to Topline
app.post('/done', (req, res) => {
  const toplineReturnUrl = process.env.TOPLINE_RETURN_URL || 'https://topline.example.com';
  req.session.destroy();
  res.redirect(toplineReturnUrl);
});

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.send('OK');
});

// Start server
async function start() {
  await initializeOIDC();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Base URL: ${process.env.BASE_URL || 'http://localhost:' + PORT}`);
  });
}

start();
