import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { EmailOtpProvider } from './email-otp.provider';

const CONFIG: Record<string, string> = {
  'email.brevoApiKey': 'test-brevo-api-key',
  'email.smtpUser': 'scholar.otp@gmail.com',
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

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('EmailOtpProvider', () => {
  let provider: EmailOtpProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new EmailOtpProvider(fakeConfigService());
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it('rejects when no contact email is supplied', async () => {
    await expect(provider.send('anything', '123456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the code via Brevo and resolves on a 200/201', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { messageId: 'abc' }));

    await expect(
      provider.send('anything', '123456', { email: 'student@example.com' }),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.brevo.com/v3/smtp/email',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'api-key': 'test-brevo-api-key' }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.sender.email).toBe('scholar.otp@gmail.com');
    expect(body.to).toEqual([{ email: 'student@example.com' }]);
    expect(body.subject).toContain('123456');
    expect(body.textContent).toContain('123456');
  });

  it('never puts the Brevo API key in the outgoing message body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { messageId: 'abc' }));
    await provider.send('anything', '123456', { email: 'student@example.com' });

    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).not.toContain('test-brevo-api-key');
  });

  it('maps a network failure (fetch throwing) to ServiceUnavailableException', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      provider.send('anything', '123456', { email: 'student@example.com' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps a non-ok Brevo response to ServiceUnavailableException', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { message: 'Key not found', code: 'unauthorized' }),
    );

    await expect(
      provider.send('anything', '123456', { email: 'student@example.com' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('never leaks the API key in a thrown error message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'Internal error' }));

    try {
      await provider.send('anything', '123456', { email: 'student@example.com' });
      fail('expected send() to throw');
    } catch (err) {
      expect((err as Error).message).not.toContain('test-brevo-api-key');
    }
  });
});
