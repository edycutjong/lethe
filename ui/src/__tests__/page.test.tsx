process.env.NEXT_PUBLIC_ENCLAVE_PUB_KEY = '04a5be7517ff3c0b57cbc5c9e29ddcccc6776fa3f9d6583283640f739d3202cb538b71744782ebe8b44f4ab9af45c65925d720f6e40a42a8219926a43c1e9ddf29';

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import LetheDashboard from '@/app/page';

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>;
  MockLink.displayName = 'MockLink';
  return MockLink;
});

describe('LetheDashboard Page', () => {
  const originalFetch = global.fetch;
  const originalConfirm = window.confirm;
  const originalAlert = window.alert;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    global.fetch = jest.fn();
    window.confirm = jest.fn().mockReturnValue(true);
    window.alert = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = jest.fn();

    // Mock localStorage
    let store: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value.toString(); },
        clear: () => { store = {}; }
      },
      writable: true
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.confirm = originalConfirm;
    window.alert = originalAlert;
    jest.useRealTimers();
  });

  const mockFetchSuccess = (data: unknown) => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => data,
    });
  };

  const mockFetchFailure = (statusText = 'Internal Error') => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText,
    });
  };

  const mockFetchEndpoints = () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('/api/zk-proof')) {
        return {
          ok: true,
          json: async () => ({ zkProof: { publicSignals: ['challenge_hash'] } }),
        };
      }
      if (url.includes('/api/encrypt')) {
        return {
          ok: true,
          json: async () => ({ envelope: { ciphertext: 'cipher' } }),
        };
      }
      if (url.includes('/erasure/enqueue')) {
        return {
          ok: true,
          json: async () => ({ jobId: 'job_123' }),
        };
      }
      if (url.includes('/erasure/fire')) {
        const brokerId = url.split('/').pop() || 'broker-mock';
        return {
          ok: true,
          json: async () => ({
            vc: JSON.stringify({
              id: 'vc_123',
              issuer: 'signer',
              credentialSubject: { broker: brokerId, timestamp: 12345 },
              proof: { type: 'Ed25519Signature2020', signatureValue: 'sig' },
            }),
          }),
        };
      }
      if (url.includes('/erasure/forget')) {
        return { ok: true };
      }
      if (url.includes('/erasure/evidence')) {
        return {
          ok: true,
          json: async () => ({
            vc: JSON.stringify({
              id: 'vc_123',
              issuer: 'signer',
              credentialSubject: { broker: 'zoominfo-mock', timestamp: 12345 },
              proof: { type: 'Ed25519Signature2020', signatureValue: 'sig' },
            }),
          }),
        };
      }
      return {
        ok: true,
        json: async () => [],
      };
    });
  };

  const flushMicrotasks = async () => {
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        jest.advanceTimersByTime(10);
      });
    }
  };


  it('renders initial dashboard and displays onboarding steps', () => {
    render(<LetheDashboard />);

    expect(screen.getByText('GDPR ART. 17 / CCPA RIGHT-TO-ERASURE ORCHESTRATOR')).toBeInTheDocument();
    expect(screen.getByText('Delete me from the internet.')).toBeInTheDocument();
    expect(screen.getByText('Step 1: SIWE Onboard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Onboard Wallet' })).toBeInTheDocument();
  });

  it('handles Step 1 SIWE Onboarding successfully', async () => {
    mockFetchSuccess({});
    render(<LetheDashboard />);

    const onboardBtn = screen.getByRole('button', { name: 'Onboard Wallet' });
    fireEvent.click(onboardBtn);

    await flushMicrotasks();
    // Initial logs fetch called due to state changes
    await act(async () => {
      jest.advanceTimersByTime(850);
    });
    await flushMicrotasks();

    expect(screen.getByRole('button', { name: 'Authenticated' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Authorize scopes' })).toBeInTheDocument();
  });

  it('handles Step 2 Agent Authorization successfully', async () => {
    // Authenticate first
    mockFetchEndpoints();
    render(<LetheDashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Onboard Wallet' }));
    await flushMicrotasks();
    await act(async () => {
      jest.advanceTimersByTime(850);
    });
    await flushMicrotasks();

    // Mock API responses for zk-proof and encrypt
    mockFetchEndpoints();

    const authorizeBtn = screen.getByRole('button', { name: 'Authorize scopes' });
    fireEvent.click(authorizeBtn);

    await flushMicrotasks();

    const batchFundBtn = screen.getByRole('button', { name: 'Batch Fund' });
    expect(batchFundBtn).toBeInTheDocument();
    expect(batchFundBtn).not.toBeDisabled();
  });

  it('handles Step 2 Agent Authorization failure', async () => {
    mockFetchSuccess({});
    render(<LetheDashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Onboard Wallet' }));
    await flushMicrotasks();
    await act(async () => {
      jest.advanceTimersByTime(850);
    });
    await flushMicrotasks();

    // Mock ZK Proof failure
    mockFetchFailure('Failed to generate proof');

    const authorizeBtn = screen.getByRole('button', { name: 'Authorize scopes' });
    fireEvent.click(authorizeBtn);

    await flushMicrotasks();

    // Should not enable the batch fund step
    const batchFundBtn = screen.getByRole('button', { name: 'Batch Fund' });
    expect(batchFundBtn).toBeDisabled();
  });

  it('handles Step 3 Batch Funding successfully', async () => {
    mockFetchEndpoints();
    render(<LetheDashboard />);

    // Step 1
    fireEvent.click(screen.getByRole('button', { name: 'Onboard Wallet' }));
    await flushMicrotasks();
    await act(async () => {
      jest.advanceTimersByTime(850);
    });
    await flushMicrotasks();

    mockFetchEndpoints();
    fireEvent.click(screen.getByRole('button', { name: 'Authorize scopes' }));
    await flushMicrotasks();

    // Step 3
    const fundBtn = screen.getByRole('button', { name: 'Batch Fund' });
    fireEvent.click(fundBtn);
    await flushMicrotasks();

    await act(async () => {
      jest.advanceTimersByTime(1300);
    });
    await flushMicrotasks();

    expect(screen.getByText('ERASE ME EVERYWHERE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ERASE NOW' })).toBeInTheDocument();
  });

  it('runs the full deletion campaign successfully and triggers self-destruct', async () => {
    mockFetchEndpoints();
    render(<LetheDashboard />);

    // Onboard, Authorize, and Fund
    fireEvent.click(screen.getByRole('button', { name: 'Onboard Wallet' }));
    await flushMicrotasks();
    await act(async () => { jest.advanceTimersByTime(850); });
    await flushMicrotasks();

    mockFetchEndpoints();
    fireEvent.click(screen.getByRole('button', { name: 'Authorize scopes' }));
    await flushMicrotasks();

    fireEvent.click(screen.getByRole('button', { name: 'Batch Fund' }));
    await flushMicrotasks();
    await act(async () => { jest.advanceTimersByTime(1300); });
    await flushMicrotasks();

    // Setup campaign mock calls
    mockFetchEndpoints();

    const eraseBtn = screen.getByRole('button', { name: 'ERASE NOW' });
    fireEvent.click(eraseBtn);

    // Wait for the asynchronous loop of 40 brokers to run
    // Each broker has 150ms timeout
    for (let i = 0; i < 42; i++) {
      await act(async () => {
        jest.advanceTimersByTime(160);
      });
      await flushMicrotasks();
    }

    expect(screen.getByRole('button', { name: 'Purge Identity & Self-Destruct' })).toBeInTheDocument();

    // Trigger self-destruct
    fireEvent.click(screen.getByRole('button', { name: 'Purge Identity & Self-Destruct' }));
    await flushMicrotasks();

    await act(async () => {
      jest.advanceTimersByTime(2100);
    });
    await flushMicrotasks();

    expect(screen.getByText('Identity Erased')).toBeInTheDocument();
    
    // Test Reinitialize Sandbox
    const reinitBtn = screen.getByRole('button', { name: 'Reinitialize Sandbox' });
    // Mock reload
    const originalReload = window.location.reload;
    Object.defineProperty(window, 'location', {
      value: { reload: jest.fn() },
      writable: true
    });
    fireEvent.click(reinitBtn);
    expect(window.location.reload).toHaveBeenCalled();
    window.location.reload = originalReload;
  });

  it('filters target brokers using tabs and loads evidence on click', async () => {
    mockFetchEndpoints();
    render(<LetheDashboard />);

    // Authenticate, Authorize, Fund to get campaign ready
    fireEvent.click(screen.getByRole('button', { name: 'Onboard Wallet' }));
    await flushMicrotasks();
    await act(async () => { jest.advanceTimersByTime(850); });
    await flushMicrotasks();
    mockFetchEndpoints();
    fireEvent.click(screen.getByRole('button', { name: 'Authorize scopes' }));
    await flushMicrotasks();
    fireEvent.click(screen.getByRole('button', { name: 'Batch Fund' }));
    await flushMicrotasks();
    await act(async () => { jest.advanceTimersByTime(1300); });
    await flushMicrotasks();

    // Filter tabs
    const foundBtn = screen.getByRole('button', { name: 'FOUND' });
    fireEvent.click(foundBtn);
    
    const deletedBtn = screen.getByRole('button', { name: 'DELETED' });
    fireEvent.click(deletedBtn);

    const allBtn = screen.getByRole('button', { name: 'ALL' });
    fireEvent.click(allBtn);

    // Mock campaign setup
    mockFetchEndpoints();

    // Start campaign, wait for first broker to complete
    fireEvent.click(screen.getByRole('button', { name: 'ERASE NOW' }));
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        jest.advanceTimersByTime(160);
      });
      await flushMicrotasks();
    }

    // Zoominfo-mock should be completed (status Deleted)
    const zoominfoElement = screen.getByText('zoominfo-mock');
    
    fireEvent.click(zoominfoElement);
    
    await flushMicrotasks();

    expect(screen.getByText('Signed Deletion Receipt')).toBeInTheDocument();
    
    // Close modal
    fireEvent.click(screen.getByText('✕'));
    await flushMicrotasks();

    expect(screen.queryByText('Signed Deletion Receipt')).not.toBeInTheDocument();
  });

  it('handles subscribe form submissions', () => {
    render(<LetheDashboard />);
    const emailInput = screen.getByPlaceholderText('Enter email or secure DID...');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    
    const subscribeBtn = screen.getByRole('button', { name: 'SUBSCRIBE' });
    fireEvent.click(subscribeBtn);

    expect(window.alert).toHaveBeenCalledWith('Successfully subscribed to Lethe updates!');
  });
});
