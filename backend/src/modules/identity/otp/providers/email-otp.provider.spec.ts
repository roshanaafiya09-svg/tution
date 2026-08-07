import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { EmailOtpProvider } from './email-otp.provider';

const sendMailMock = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: sendMailMock })),
}));

const CONFIG: Record<string, string | number> = {
  'email.smtpHost': 'smtp.example.com',
  'email.smtpPort': 587,
  'email.smtpUser': 'apikey',
  'email.smtpPass': 'test-smtp-password',
  'email.smtpFrom': 'otp@example.com',
};

function fakeConfigService(): ConfigService {
  return {
    getOrThrow: (key: string) => {
      const value = CONFIG[key];
      if (value === undefined) throw new Error(`missing config: ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('EmailOtpProvider', () => {
  let provider: EmailOtpProvider;

  beforeEach(() => {
    provider = new EmailOtpProvider(fakeConfigService());
    sendMailMock.mockReset();
  });

  it('rejects when no email is supplied', async () => {
    await expect(
      provider.send('+919876543210', '123456'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends an HTML + text email containing the code to the supplied address', async () => {
    sendMailMock.mockResolvedValue({ messageId: 'abc' });

    await expect(
      provider.send('+919876543210', '123456', {
        email: 'student@example.com',
      }),
    ).resolves.toBeUndefined();

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'otp@example.com',
        to: 'student@example.com',
        text: expect.stringContaining('123456'),
        html: expect.stringContaining('123456'),
      }),
    );
  });

  it('never puts the SMTP password in the outgoing message', async () => {
    sendMailMock.mockResolvedValue({});
    await provider.send('+919876543210', '123456', {
      email: 'student@example.com',
    });

    const call = sendMailMock.mock.calls[0][0];
    expect(JSON.stringify(call)).not.toContain('test-smtp-password');
  });

  it('maps an SMTP failure to ServiceUnavailableException without leaking the error internals as OTP content', async () => {
    sendMailMock.mockRejectedValue(new Error('535 Authentication failed'));

    await expect(
      provider.send('+919876543210', '123456', {
        email: 'student@example.com',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('reuses a single transporter across sends (does not reconnect every call)', async () => {
    const nodemailer = jest.requireMock('nodemailer');
    nodemailer.createTransport.mockClear();
    sendMailMock.mockResolvedValue({});

    await provider.send('+919876543210', '111111', {
      email: 'a@example.com',
    });
    await provider.send('+919876543210', '222222', {
      email: 'a@example.com',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
  });
});
