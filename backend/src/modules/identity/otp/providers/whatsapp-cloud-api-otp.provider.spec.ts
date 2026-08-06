import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { WhatsAppCloudApiOtpProvider } from './whatsapp-cloud-api-otp.provider';

const CONFIG: Record<string, string> = {
  'whatsapp.accessToken': 'test-access-token',
  'whatsapp.phoneNumberId': '1234567890',
  'whatsapp.templateName': 'otp_login',
  'whatsapp.templateLanguage': 'en_US',
  'whatsapp.apiVersion': 'v21.0',
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

describe('WhatsAppCloudApiOtpProvider', () => {
  let provider: WhatsAppCloudApiOtpProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new WhatsAppCloudApiOtpProvider(fakeConfigService());
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sends the template message and resolves on a 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { messages: [{ id: 'wamid.1' }] }));

    await expect(provider.send('+919876543210', '123456')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/1234567890/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
        }),
      }),
    );
    // Meta's API wants the number without the leading '+'.
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toBe('919876543210');
    expect(body.template.name).toBe('otp_login');
    expect(body.template.components[0].parameters[0].text).toBe('123456');
  });

  it('never puts the access token in the outgoing message body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await provider.send('+919876543210', '123456');

    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).not.toContain('test-access-token');
  });

  it('maps a network failure (fetch throwing) to ServiceUnavailableException', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(provider.send('+919876543210', '123456')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('maps a 429 (account-level rate limit) to ServiceUnavailableException, not a per-user rate-limit message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { error: { message: 'Too many requests', type: 'OAuthException' } }),
    );

    await expect(provider.send('+919876543210', '123456')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('maps a 401 / OAuthException (expired token) to ServiceUnavailableException', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        error: { message: 'Error validating access token', type: 'OAuthException', code: 190 },
      }),
    );

    await expect(provider.send('+919876543210', '123456')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('maps a template-related error to ServiceUnavailableException', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: {
          message: 'Template name does not exist in the translation',
          type: 'GraphMethodException',
        },
      }),
    );

    await expect(provider.send('+919876543210', '123456')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('falls back to a generic InternalServerErrorException for anything unrecognized', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { error: { message: 'Internal server error', type: 'Unknown' } }),
    );

    await expect(provider.send('+919876543210', '123456')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('never leaks the access token in a thrown error message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { error: { message: 'Internal server error' } }),
    );

    try {
      await provider.send('+919876543210', '123456');
      fail('expected send() to throw');
    } catch (err) {
      expect((err as Error).message).not.toContain('test-access-token');
    }
  });
});
