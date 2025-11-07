'use strict';

jest.unmock('../../../backend/src/services/email');

describe('services/email', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.clearAllMocks();
    Object.assign(process.env, originalEnv);
  });

  function setupEnv(overrides = {}) {
    Object.assign(process.env, {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_USER: 'mailer',
      SMTP_PASS: 'secret',
      SMTP_FROM: 'no-reply@example.com',
      ...overrides,
    });
  }

  function loadEmailModule() {
    jest.resetModules();
    const nodemailerMock = { createTransport: jest.fn() };
    jest.doMock('nodemailer', () => nodemailerMock, { virtual: true });
    const { sendMail } = require('../../../backend/src/services/email');
    return { sendMail, nodemailerMock };
  }

  test('sendMail creates transporter with env config and sends message', async () => {
    setupEnv();
    const sendMailImpl = jest.fn().mockResolvedValue({ messageId: 'abc' });
    const { sendMail, nodemailerMock } = loadEmailModule();
    nodemailerMock.createTransport.mockReturnValue({ sendMail: sendMailImpl });

    const payload = { to: 'user@test.com', subject: 'Hello', text: 'Hi' };
    const result = await sendMail(payload);

    expect(nodemailerMock.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'mailer', pass: 'secret' },
    });
    expect(sendMailImpl).toHaveBeenCalledWith({
      from: 'no-reply@example.com',
      ...payload,
    });
    expect(result).toEqual({ messageId: 'abc' });
  });

  test('sendMail reuses transporter across calls', async () => {
    setupEnv({ SMTP_PORT: '587' }); // non-secure port
    const sendMailImpl = jest.fn().mockResolvedValue({});
    const { sendMail, nodemailerMock } = loadEmailModule();
    nodemailerMock.createTransport.mockReturnValue({ sendMail: sendMailImpl });

    await sendMail({ to: 'a@test.com' });
    await sendMail({ to: 'b@test.com' });

    expect(nodemailerMock.createTransport).toHaveBeenCalledTimes(1);
    expect(sendMailImpl).toHaveBeenCalledTimes(2);
  });
});
