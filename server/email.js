const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.RESEND_FROM || 'Wealthline <noreply@wealthline.app>';

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    // No email provider configured yet — fall back to logging so the flow is
    // still testable locally without blocking on a third-party signup.
    console.warn(`[email] RESEND_API_KEY not set. Would have sent to ${to}: ${subject}`);
    console.warn(html);
    return { delivered: false };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to send email: ${res.status} ${body}`);
  }
  return { delivered: true };
}

function sendPasswordResetEmail(to, resetUrl) {
  return sendEmail({
    to,
    subject: 'Reset your Wealthline password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #6366f1;">Reset your password</h2>
        <p>We received a request to reset the password for your Wealthline account.</p>
        <p>
          <a href="${resetUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
            Reset Password
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `
  });
}

module.exports = { sendEmail, sendPasswordResetEmail };
