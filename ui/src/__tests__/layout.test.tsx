import React from 'react';
import '@testing-library/jest-dom';
import RootLayout, { metadata } from '@/app/layout';

// Mock next/font/google
jest.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'mock-inter-sans' }),
  Orbitron: () => ({ variable: 'mock-orbitron' }),
  JetBrains_Mono: () => ({ variable: 'mock-jetbrains-mono' }),
}));

describe('RootLayout', () => {
  it('renders children correctly and sets font variables on html element', () => {
    const result = RootLayout({
      children: <div data-testid="child-element">Hello Lethe</div>,
    });

    // Verify root is html tag
    expect(result.type).toBe('html');
    expect(result.props.lang).toBe('en');
    expect(result.props.className).toContain('mock-inter-sans');
    expect(result.props.className).toContain('mock-orbitron');
    expect(result.props.className).toContain('mock-jetbrains-mono');
    expect(result.props.className).toContain('h-full');
    expect(result.props.className).toContain('antialiased');
    expect(result.props.className).toContain('dark');

    // Verify body element exists
    const body = result.props.children;
    expect(body.type).toBe('body');
    expect(body.props.className).toContain('min-h-full');
    expect(body.props.className).toContain('bg-[#02040a]');
    expect(body.props.className).toContain('text-slate-100');
    expect(body.props.className).toContain('font-sans');
    expect(body.props.className).toContain('flex');
    expect(body.props.className).toContain('flex-col');

    // Verify children are passed inside body
    const child = body.props.children;
    expect(child.props['data-testid']).toBe('child-element');
  });

  it('exports correct metadata configuration', () => {
    expect(metadata.metadataBase?.toString()).toBe('https://lethe.edycu.dev/');
    expect(metadata.title).toBe('Lethe — Delete me from the internet. Then delete the agent too.');
    expect(metadata.description).toBe(
      'Autonomous right-to-erasure (GDPR Art. 17 / CCPA) agent coordinator powered by Terminal 3 Secure TEE Enclaves.'
    );
    expect(metadata.icons).toEqual({
      icon: '/icon.svg',
      apple: '/apple-touch-icon.png',
    });
    expect(metadata.appleWebApp).toEqual({
      capable: true,
      title: 'Lethe',
      statusBarStyle: 'black-translucent',
    });
    expect(metadata.other).toEqual({
      'mobile-web-app-capable': 'yes',
    });
    expect(metadata.openGraph?.title).toBe('Lethe — Delete me from the internet. Then delete the agent too.');
    expect(metadata.openGraph?.url).toBe('https://lethe.edycu.dev');
    expect((metadata.twitter as Record<string, unknown>)?.card).toBe('summary_large_image');
  });
});
