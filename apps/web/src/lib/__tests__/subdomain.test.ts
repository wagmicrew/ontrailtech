import { describe, it, expect } from 'vitest';
import { resolveRunnerFromSubdomain } from '../subdomain';

describe('resolveRunnerFromSubdomain', () => {
  // Requirement 1.1: extract runner username in lowercase
  describe('valid runner subdomains', () => {
    it('returns lowercase username for a valid subdomain', () => {
      expect(resolveRunnerFromSubdomain('hansen.ontrail.tech')).toBe('hansen');
    });

    it('lowercases mixed-case hostnames', () => {
      expect(resolveRunnerFromSubdomain('Hansen.ontrail.tech')).toBe('hansen');
      expect(resolveRunnerFromSubdomain('ALICE.ONTRAIL.TECH')).toBe('alice');
    });

    it('handles usernames with hyphens', () => {
      expect(resolveRunnerFromSubdomain('trail-runner.ontrail.tech')).toBe('trail-runner');
    });

    it('handles numeric usernames', () => {
      expect(resolveRunnerFromSubdomain('user123.ontrail.tech')).toBe('user123');
    });
  });

  // Requirement 1.2: reserved subdomains return null
  describe('reserved subdomains', () => {
    it('returns null for bare domain ontrail.tech', () => {
      expect(resolveRunnerFromSubdomain('ontrail.tech')).toBeNull();
    });

    it('returns null for app.ontrail.tech', () => {
      expect(resolveRunnerFromSubdomain('app.ontrail.tech')).toBeNull();
    });

    it('returns null for api.ontrail.tech', () => {
      expect(resolveRunnerFromSubdomain('api.ontrail.tech')).toBeNull();
    });

    it('returns null for www.ontrail.tech', () => {
      expect(resolveRunnerFromSubdomain('www.ontrail.tech')).toBeNull();
    });

    it('returns null for reserved subdomains regardless of case', () => {
      expect(resolveRunnerFromSubdomain('APP.ontrail.tech')).toBeNull();
      expect(resolveRunnerFromSubdomain('Api.ONTRAIL.TECH')).toBeNull();
      expect(resolveRunnerFromSubdomain('WWW.Ontrail.Tech')).toBeNull();
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('returns null for empty string', () => {
      expect(resolveRunnerFromSubdomain('')).toBeNull();
    });

    it('returns null for localhost', () => {
      expect(resolveRunnerFromSubdomain('localhost')).toBeNull();
    });

    it('returns null for unrelated domains', () => {
      expect(resolveRunnerFromSubdomain('example.com')).toBeNull();
      expect(resolveRunnerFromSubdomain('hansen.example.com')).toBeNull();
    });

    it('returns null for nested subdomains', () => {
      expect(resolveRunnerFromSubdomain('a.b.ontrail.tech')).toBeNull();
    });

    it('trims whitespace from hostname', () => {
      expect(resolveRunnerFromSubdomain('  hansen.ontrail.tech  ')).toBe('hansen');
    });
  });
});
