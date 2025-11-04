import { google } from 'googleapis';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || '';
const USER = process.env.GMAIL_USER || 'me';

function client() {
  const o = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  o.setCredentials({ refresh_token: REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: o });
}

function encodeMail(lines: string[]) {
  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function gmailSendDraftAsReply(opts: {
  to?: string;
  messageId: string;
  threadId: string;
  replyText: string;
  subject?: string;
}) {
  const gmail = client();
  const safeTo = opts.to || USER;
  const safeSubject = opts.subject ? `Re: ${opts.subject}` : 'Re: Your request';

  const encoded = encodeMail([
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    `In-Reply-To: ${opts.messageId}`,
    `References: ${opts.messageId}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    opts.replyText,
  ]);

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded, threadId: opts.threadId },
  });

  return { ok: true } as const;
}

export async function gmailForwardToDept(opts: {
  deptEmail: string;
  originalSubject?: string;
  body: string;
}) {
  const gmail = client();
  const subject = `FWD: ${opts.originalSubject || 'Customer case'}`;
  const encoded = encodeMail([
    `To: ${opts.deptEmail}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    opts.body,
  ]);
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
  return { ok: true } as const;
}