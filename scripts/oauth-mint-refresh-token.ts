// scripts/oauth-mint-refresh-token.ts
// Generate Gmail OAuth refresh token

import 'dotenv/config';
import { google } from 'googleapis';
import * as readline from 'readline';

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

async function main() {
  console.log('\n🔐 Gmail OAuth2 Token Generator\n');
  console.log('════════════════════════════════════════════════\n');

  // Get credentials from env or prompt
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('❌ Error: GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env');
    console.log('\nPlease add these to your .env file:');
    console.log('  GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com');
    console.log('  GMAIL_CLIENT_SECRET=your-client-secret');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3000/oauth2callback' // Redirect URI for Desktop app
  );

  // Alternative redirect URI for Desktop apps
  const REDIRECT_URIS = [
    'http://localhost:3000/oauth2callback',
    'urn:ietf:wg:oauth:2.0:oob', // For copy-paste flow
  ];

  // Try with the "out of band" flow for desktop apps
  const oob = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'urn:ietf:wg:oauth:2.0:oob'
  );

  // Generate auth URL
  const authUrl = oob.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent screen to get refresh token
  });

  console.log('📋 Step 1: Authorize this app\n');
  console.log('Open this URL in your browser:\n');
  console.log(`  ${authUrl}\n`);
  console.log('════════════════════════════════════════════════\n');
  console.log('⚠️  Important: Sign in with the email address you want to');
  console.log('   use for SENDING customer support emails.\n');
  console.log('   This should be: support@yourcompany.com (or similar)\n');
  console.log('════════════════════════════════════════════════\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('📝 Paste the authorization code here: ', async (code) => {
    rl.close();

    try {
      console.log('\n🔄 Exchanging code for tokens...\n');
      
      const { tokens } = await oob.getToken(code);
      
      if (!tokens.refresh_token) {
        console.error('❌ Error: No refresh token received!');
        console.log('\nThis usually means:');
        console.log('  1. You already authorized this app before');
        console.log('  2. The consent screen didn\'t force re-authorization\n');
        console.log('🔧 Fix: Revoke access and try again:');
        console.log('  → Go to: https://myaccount.google.com/permissions');
        console.log('  → Find your app and click "Remove Access"');
        console.log('  → Run this script again\n');
        process.exit(1);
      }

      console.log('✅ Success! Here are your tokens:\n');
      console.log('════════════════════════════════════════════════');
      console.log('\n📋 Add these to your .env file:\n');
      console.log(`GMAIL_CLIENT_ID=${clientId}`);
      console.log(`GMAIL_CLIENT_SECRET=${clientSecret}`);
      console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log(`GMAIL_USER=me  # or your-email@domain.com\n`);
      console.log('════════════════════════════════════════════════\n');
      console.log('⚠️  Keep these tokens SECRET - do not commit to git!\n');
      
      // Test the token works
      console.log('🧪 Testing token...\n');
      oob.setCredentials(tokens);
      const gmail = google.gmail({ version: 'v1', auth: oob });
      
      try {
        const profile = await gmail.users.getProfile({ userId: 'me' });
        console.log(`✅ Token works! Connected to: ${profile.data.emailAddress}\n`);
      } catch (error) {
        console.log('⚠️  Token generated but couldn\'t verify (might still work)\n');
      }

      console.log('🎉 Setup complete! You can now send emails via Gmail API.\n');
      
    } catch (error: any) {
      console.error('\n❌ Error getting tokens:', error.message);
      
      if (error.message.includes('invalid_grant')) {
        console.log('\n🔧 Fix: The authorization code expired or was already used.');
        console.log('   Run the script again and use a fresh code.\n');
      } else if (error.message.includes('redirect_uri_mismatch')) {
        console.log('\n🔧 Fix: Redirect URI mismatch.');
        console.log('   In Google Cloud Console:');
        console.log('   → Go to APIs & Services → Credentials');
        console.log('   → Edit your OAuth 2.0 Client');
        console.log('   → Add: urn:ietf:wg:oauth:2.0:oob\n');
      } else {
        console.log('\n💡 If problems persist, check:');
        console.log('   → OAuth client type is "Desktop app"');
        console.log('   → Gmail API is enabled');
        console.log('   → Scopes include gmail.send\n');
      }
      
      process.exit(1);
    }
  });
}

main().catch(console.error);