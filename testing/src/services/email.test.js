jest.mock(
  'nodemailer',
  () => ({
    createTransport: jest.fn(),
  }),
  { virtual: true }
);
jest.unmock('../../../backend/src/services/email');

let nodemailer;

describe('services/email', () => {
  const mockSendMail = jest.fn().mockResolvedValue({ messageId: '123' });
  let emailService;

  const setEnv = () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'user';
    process.env.SMTP_PASS = 'pass';
    process.env.SMTP_FROM = 'from@example.com';
  };

  beforeEach(() => {
    jest.resetModules();
    setEnv();
    jest.isolateModules(() => {
      nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReset();
      mockSendMail.mockReset().mockResolvedValue({ messageId: '123' });
      nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });
      emailService = require('../../../backend/src/services/email');
    });
  });

  it('builds transporter from env config and forwards message fields', async () => {
    await emailService.sendMail({
      to: 'dest@example.com',
      subject: 'Subject',
      text: 'Plain',
      html: '<p>HTML</p>',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'user', pass: 'pass' },
    });
    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'from@example.com',
      to: 'dest@example.com',
      subject: 'Subject',
      text: 'Plain',
      html: '<p>HTML</p>',
    });
  });

  it('reuses transporter across multiple sendMail calls', async () => {
    await emailService.sendMail({ to: 'a@example.com', subject: 'First' });
    await emailService.sendMail({ to: 'b@example.com', subject: 'Second' });

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it('creates secure transporter without auth when port is 465', async () => {
    process.env.SMTP_PORT = '465';
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    jest.isolateModules(() => {
      nodemailer = require('nodemailer');
      nodemailer.createTransport.mockReset();
      nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });
      const service = require('../../../backend/src/services/email');
      service.sendMail({ to: 'secure@example.com', subject: 'Secure' });
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: undefined,
    });
  });
});
