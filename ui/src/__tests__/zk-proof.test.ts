import { POST } from '@/app/api/zk-proof/route';

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
        generateZkProof: jest.fn().mockImplementation(async (email: string) => {
          if (email === 'fail@example.com') {
            throw new Error('SDK Failure');
          }
          return { proof: 'mock-proof', publicSignals: ['challenge_123'] };
        }),
      };
    }),
  };
});

describe('POST /api/zk-proof', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns zkProof successfully when valid email and salt are provided', async () => {
    const requestBody = { email: 'sophie@example.com', salt: 'salt123' };
    const mockRequest = {
      json: async () => requestBody,
    } as unknown as Request;

    const response = await POST(mockRequest);
    expect(response.status).toBe(200);
    
    const json = await response.json();
    expect(json.zkProof).toEqual({ proof: 'mock-proof', publicSignals: ['challenge_123'] });
  });

  it('returns 400 when email is missing', async () => {
    const requestBody = { salt: 'salt123' };
    const mockRequest = {
      json: async () => requestBody,
    } as unknown as Request;

    const response = await POST(mockRequest);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('Missing email or salt');
  });

  it('returns 400 when salt is missing', async () => {
    const requestBody = { email: 'sophie@example.com' };
    const mockRequest = {
      json: async () => requestBody,
    } as unknown as Request;

    const response = await POST(mockRequest);
    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('Missing email or salt');
  });

  it('returns 500 when LetheClient throws an error', async () => {
    const requestBody = { email: 'fail@example.com', salt: 'salt123' };
    const mockRequest = {
      json: async () => requestBody,
    } as unknown as Request;

    const response = await POST(mockRequest);
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toBe('SDK Failure');
  });
});
