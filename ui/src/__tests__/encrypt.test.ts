import { POST } from '@/app/api/encrypt/route';

// Mock next/server
jest.mock('next/server', () => {
  return {
    NextResponse: {
      json: jest.fn().mockImplementation((body: unknown, init?: { status?: number }) => {
        return {
          status: init?.status ?? 200,
          json: async () => body,
        };
      }),
    },
  };
});

// Mock @lethe/sdk
jest.mock('@lethe/sdk', () => {
  return {
    LetheClient: jest.fn().mockImplementation(() => {
      return {
        encryptPayload: jest.fn().mockImplementation(async (pii: Record<string, unknown>, enclavePubKey: string) => {
          if (enclavePubKey === 'fail_key') {
            throw new Error('SDK Encryption Failure');
          }
          return { ciphertext: 'mock-ciphertext', ephemPublicKey: 'mock-ephem-key' };
        }),
      };
    }),
  };
});

describe('POST /api/encrypt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns encrypted envelope successfully when valid pii and enclavePubKey are provided', async () => {
    const requestBody = { pii: { email: 'sophie@example.com' }, enclavePubKey: 'mock_pub_key' };
    const mockRequest = {
      json: async () => requestBody,
    } as unknown as Request;

    const response = await POST(mockRequest);
    expect(response.status).toBe(200);
    
    const json = await response.json();
    expect(json.envelope).toEqual({ ciphertext: 'mock-ciphertext', ephemPublicKey: 'mock-ephem-key' });
  });

  it('returns 400 when pii is missing', async () => {
    const requestBody = { enclavePubKey: 'mock_pub_key' };
    const mockRequest = {
      json: async () => requestBody,
    } as unknown as Request;

    const response = await POST(mockRequest);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('Missing pii or enclavePubKey');
  });

  it('returns 400 when enclavePubKey is missing', async () => {
    const requestBody = { pii: { email: 'sophie@example.com' } };
    const mockRequest = {
      json: async () => requestBody,
    } as unknown as Request;

    const response = await POST(mockRequest);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('Missing pii or enclavePubKey');
  });

  it('returns 500 when LetheClient throws an error', async () => {
    const requestBody = { pii: { email: 'sophie@example.com' }, enclavePubKey: 'fail_key' };
    const mockRequest = {
      json: async () => requestBody,
    } as unknown as Request;

    const response = await POST(mockRequest);
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe('SDK Encryption Failure');
  });
});
