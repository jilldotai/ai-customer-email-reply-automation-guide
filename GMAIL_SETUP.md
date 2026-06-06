# Gmail OAuth2 Setup Guide

This guide helps you set up Gmail authentication for automated email sending.

## 🎯 Overview

Your AI assistant needs permission to send emails on behalf of your support email (e.g., `support@yourcompany.com`). This requires:

1. Google Cloud Project
2. OAuth2 credentials
3. Refresh token

**Time required**: ~15 minutes

---

## 📋 Prerequisites

- Google Workspace or Gmail account
- Admin access to the email account you'll use
- Access to Google Cloud Console

---

## 🔧 Step-by-Step Setup

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. Name: `customer-email-automation`
4. Click **"Create"**

### 2. Enable Gmail API

1. In your project, go to **"APIs & Services"** → **"Library"**
2. Search for **"Gmail API"**
3. Click on it, then click **"Enable"**

### 3. Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Choose **"Internal"** (if Google Workspace) or **"External"**
   - ⚠️ **IMPORTANT**: If External, set to "In Production" later to avoid 7-day token expiry
3. Fill in:
   - **App name**: Customer Email Automation
   - **User support email**: your-email@yourcompany.com
   - **Developer contact**: your-email@yourcompany.com
4. Click **"Save and Continue"**
5. **Scopes**: Click **"Add or Remove Scopes"**
   - Search and add: `https://www.googleapis.com/auth/gmail.send`
   - Click **"Update"**
6. Click **"Save and Continue"** through remaining steps

### 4. Create OAuth2 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Application type: **"Desktop app"**
4. Name: `Email Automation Client`
5. Click **"Create"**
6. **Download JSON** or copy:
   - Client ID
   - Client Secret

### 5. Generate Refresh Token

Run the provided script:

```bash
npm run mint:gmail
```

The script will:
1. Open a browser window
2. Ask you to sign in with your support email
3. Grant permissions
4. Display your **refresh token**

**Save this token** - you'll need it in `.env`

---

## 🔐 Security Configuration

### For Google Workspace (Recommended)

1. **OAuth Consent Screen**: Set to **"Internal"**
   - Only users in your organization can authorize
   - Tokens don't expire after 7 days

### For External Apps

⚠️ **Critical**: Set app to "In Production" to avoid token expiry

1. Go to **OAuth consent screen**
2. Click **"Publish App"**
3. Confirm publishing
4. **Verification**: Google may require verification if you have >100 users
   - This can take 4-6 weeks
   - For testing, stay in "Testing" mode but regenerate tokens weekly

---

## 📝 Update .env

Add the credentials to your `.env` file:

```bash
# Gmail OAuth2
GMAIL_CLIENT_ID=123456789.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-abc123...
GMAIL_REFRESH_TOKEN=1//0abc123...
GMAIL_USER=support@yourcompany.com
```

---

## ✅ Test Your Setup

```bash
# Test sending
curl -X POST http://localhost:3000/reply \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "test-msg-001",
    "threadId": "test-thread-001",
    "prompt": "Test email"
  }'
```

Check if email was sent to your Gmail account.

---

## 🔄 Token Refresh

**Good news**: The SDK handles token refresh automatically!

- Access tokens expire in 1 hour
- Refresh tokens are long-lived (until revoked)
- The `googleapis` library auto-refreshes when needed

### Manual Token Regeneration

If your refresh token stops working:

1. Revoke old token:
   - Go to [Google Account Permissions](https://myaccount.google.com/permissions)
   - Find "Customer Email Automation"
   - Click **"Remove Access"**

2. Generate new token:
   ```bash
   npm run mint:gmail
   ```

3. Update `.env` with new `GMAIL_REFRESH_TOKEN`

---

## 🚨 Troubleshooting

### Error: "invalid_grant"

**Causes**:
- Refresh token expired (external apps in testing mode)
- Token was revoked
- OAuth consent screen changed

**Fix**: Regenerate token with `npm run mint:gmail`

### Error: "insufficient_scope"

**Cause**: Missing Gmail send scope

**Fix**:
1. Go to OAuth consent screen → Scopes
2. Add `https://www.googleapis.com/auth/gmail.send`
3. Regenerate tokens

### Error: "redirect_uri_mismatch"

**Cause**: OAuth client type mismatch

**Fix**: Ensure you created a **"Desktop app"** client, not "Web application"

### Daily Send Limit Exceeded

**Gmail Limits**:
- **Gmail free**: 500 emails/day
- **Google Workspace**: 2,000 emails/day

**Solutions**:
- Upgrade to Google Workspace
- Use SendGrid/Mailgun for high volume
- Implement sending queue

---

## 🔒 Security Best Practices

1. **Never commit credentials** to git
   - ✅ Use `.env` (in .gitignore)
   - ✅ Use secrets manager in production

2. **Limit scope**
   - ✅ Only request `gmail.send` (not `gmail.readonly`)

3. **Rotate tokens**
   - 🔄 Regenerate every 90 days
   - 🔄 Immediately if compromised

4. **Monitor usage**
   - 📊 Check Gmail API quotas in Cloud Console
   - 📊 Set up quota alerts

5. **Use service accounts** (Enterprise)
   - For domain-wide delegation
   - More secure than user OAuth

---

## 📚 Additional Resources

- [Gmail API Docs](https://developers.google.com/gmail/api)
- [OAuth2 Best Practices](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud IAM](https://cloud.google.com/iam/docs)

---

## 🆘 Still Having Issues?

1. Check [Google API Console](https://console.cloud.google.com/) for quota errors
2. Verify all scopes are approved in OAuth consent screen
3. Check `.env` for typos (no spaces around `=`)
4. Review server logs for detailed error messages

---

**Setup complete!** 🎉 Your AI assistant can now send emails.