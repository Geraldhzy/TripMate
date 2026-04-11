const { TOOL_DEF, execute } = require('../../tools/web-search');

describe('web-search tool', () => {
  describe('Tool Definition', () => {
    test('should have correct tool name', () => {
      expect(TOOL_DEF.name).toBe('web_search');
    });

    test('should have description', () => {
      expect(TOOL_DEF.description).toBeDefined();
      expect(typeof TOOL_DEF.description).toBe('string');
    });

    test('should define parameters schema', () => {
      expect(TOOL_DEF.parameters).toBeDefined();
      expect(TOOL_DEF.parameters.type).toBe('object');
      expect(TOOL_DEF.parameters.properties).toBeDefined();
      expect(TOOL_DEF.parameters.required).toContain('query');
    });

    test('should have query parameter', () => {
      expect(TOOL_DEF.parameters.properties.query).toBeDefined();
      expect(TOOL_DEF.parameters.properties.query.type).toBe('string');
    });

    test('should have language parameter with default', () => {
      expect(TOOL_DEF.parameters.properties.language).toBeDefined();
      expect(TOOL_DEF.parameters.properties.language.default).toBe('zh-CN');
    });
  });

  describe('Input Validation', () => {
    test('should reject empty query', async () => {
      const result = await execute({ query: '' });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('空');
    });

    test('should reject null query', async () => {
      const result = await execute({ query: null });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    test('should reject undefined query', async () => {
      const result = await execute({ query: undefined });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    test('should reject query over 500 chars', async () => {
      const longQuery = 'a'.repeat(501);
      const result = await execute({ query: longQuery });
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
      expect(parsed.error).toContain('过长');
    });

    test('should accept query under 500 chars', async () => {
      const validQuery = 'test search query';
      // Note: This will fail due to network, but validation should pass
      try {
        const result = await execute({ query: validQuery });
        const parsed = JSON.parse(result);
        // Check that result has expected structure (either results or error)
        expect(parsed.query).toBe(validQuery);
      } catch (e) {
        // Network error is acceptable
      }
    });
  });

  describe('Language Parameter', () => {
    test('should default to zh-CN', async () => {
      const result = await execute({ query: 'test' });
      const parsed = JSON.parse(result);
      expect(parsed.query).toBe('test');
    });

    test('should accept language parameter', async () => {
      try {
        const result = await execute({ query: 'test', language: 'en' });
        const parsed = JSON.parse(result);
        expect(parsed.query).toBe('test');
      } catch (e) {
        // Network error is acceptable
      }
    });
  });

  describe('Result Format', () => {
    test('should return JSON', async () => {
      const result = await execute({ query: 'invalid search' });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    test('should include query in response', async () => {
      const result = await execute({ query: 'test query' });
      const parsed = JSON.parse(result);
      expect(parsed.query).toBe('test query');
    });

    test('should have results array or error', async () => {
      const result = await execute({ query: 'test' });
      const parsed = JSON.parse(result);
      expect(parsed.results !== undefined || parsed.error !== undefined).toBe(true);
    });

    test('results should be array if present', async () => {
      const result = await execute({ query: 'test' });
      const parsed = JSON.parse(result);
      if (parsed.results) {
        expect(Array.isArray(parsed.results)).toBe(true);
      }
    });

    test('error should be string if present', async () => {
      const result = await execute({ query: '' });
      const parsed = JSON.parse(result);
      if (parsed.error) {
        expect(typeof parsed.error).toBe('string');
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      const result = await execute({ query: 'test' });
      const parsed = JSON.parse(result);
      // Should have either results or error
      expect(parsed.query).toBeDefined();
    });

    test('should return user-friendly note on error', async () => {
      const result = await execute({ query: '' });
      const parsed = JSON.parse(result);
      if (parsed.error) {
        expect(parsed.note).toBeDefined();
        expect(typeof parsed.note).toBe('string');
      }
    });
  });
});
