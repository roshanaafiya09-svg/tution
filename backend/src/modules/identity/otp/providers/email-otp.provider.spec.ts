import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailOtpProvider } from './email-otp.provider';

jest.mock('nodemailer');

const CONFIG: Record<string, string | number> = {
  'email.smtpHost': 'smtp.gmail.com',
  'email.smtpPort': 465,
  'email.smtpUser': 'test@example.com',
  'email.smtpPass': 'super-secret-app-password',
  'email.smtpFrom': 'Scholar <test@example.com>',
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
  let sendMailMock: jest.Mock;

  beforeEach(() => {
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: sendMailMock,
    });
    provider = new EmailOtpProvider(fakeConfigService());
  });

  it('rejects when no contact email is supplied', async () => {
    await expect(provider.send('anything', '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('sends the code and resolves', async () => {
    await expect(
      provider.send('anything', '123456', { email: 'student@example.com' }),
    ).resolves.toBeUndefined();

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0];
    expect(mail.to).toBe('student@example.com');
    expect(mail.from).toBe('Scholar <test@example.com>');
    expect(mail.subject).toContain('123456');
    expect(mail.text).toContain('123456');
    expect(mail.html).toBeUndefined();
  });

  it('never puts the SMTP password in the outgoing message', async () => {
    await provider.send('anything', '123456', { email: 'student@example.com' });

    const mail = sendMailMock.mock.calls[0][0];
    expect(mail.subject).not.toContain('super-secret-app-password');
    expect(mail.text).not.toContain('super-secret-app-password');
  });

  it('maps a send failure to ServiceUnavailableException without leaking credentials', async () => {
    sendMailMock.mockRejectedValue(new Error('535 Authentication failed'));

    try {
      await provider.send('anything', '123456', { email: 'student@example.com' });
      fail('expected send() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as Error).message).not.toContain('super-secret-app-password');
    }
  });
});
