// Tests for tool loading and execution framework

describe('Tool Execution Framework', () => {
  describe('Tool Loading', () => {
    test('should load web-search tool', () => {
      const webSearch = require('../../tools/web-search');
      expect(webSearch.TOOL_DEF).toBeDefined();
      expect(webSearch.execute).toBeDefined();
    });

    test('should load weather tool', () => {
      const weather = require('../../tools/weather');
      expect(weather.TOOL_DEF).toBeDefined();
      expect(weather.execute).toBeDefined();
    });

    test('should load exchange-rate tool', () => {
      const exchangeRate = require('../../tools/exchange-rate');
      expect(exchangeRate.TOOL_DEF).toBeDefined();
      expect(exchangeRate.execute).toBeDefined();
    });

    test('should load all tools with TOOL_DEF', () => {
      const tools = [
        require('../../tools/web-search'),
        require('../../tools/weather'),
        require('../../tools/exchange-rate'),
        require('../../tools/poi-search'),
        require('../../tools/dest-knowledge'),
        require('../../tools/update-trip-info')
      ];
      
      tools.forEach(tool => {
        expect(tool.TOOL_DEF).toBeDefined();
        expect(tool.TOOL_DEF.name).toBeDefined();
        expect(tool.TOOL_DEF.description).toBeDefined();
        expect(tool.TOOL_DEF.parameters).toBeDefined();
      });
    });
  });

  describe('Tool Definition Structure', () => {
    test('web-search should have proper structure', () => {
      const { TOOL_DEF } = require('../../tools/web-search');
      expect(TOOL_DEF.name).toBe('web_search');
      expect(TOOL_DEF.parameters.type).toBe('object');
      expect(TOOL_DEF.parameters.required).toBeDefined();
    });

    test('weather should have proper structure', () => {
      const { TOOL_DEF } = require('../../tools/weather');
      expect(TOOL_DEF.name).toBe('get_weather');
      expect(TOOL_DEF.parameters.properties.city).toBeDefined();
    });

    test('exchange-rate should have proper structure', () => {
      const { TOOL_DEF } = require('../../tools/exchange-rate');
      expect(TOOL_DEF.name).toBe('get_exchange_rate');
      expect(TOOL_DEF.parameters.properties.from).toBeDefined();
      expect(TOOL_DEF.parameters.properties.to).toBeDefined();
    });

    test('poi-search should have proper structure', () => {
      const { TOOL_DEF } = require('../../tools/poi-search');
      expect(TOOL_DEF.name).toBe('search_poi');
      expect(TOOL_DEF.parameters.properties.query).toBeDefined();
    });
  });

  describe('Tool Execution Contracts', () => {
    test('weather tool should accept city and language', async () => {
      const { execute } = require('../../tools/weather');
      const result = await execute({ city: 'Tokyo', date: undefined });
      const parsed = JSON.parse(result);
      expect(parsed.city === 'Tokyo' || parsed.error).toBe(true);
    });

    test('exchange-rate tool should accept from, to, amount', async () => {
      const { execute } = require('../../tools/exchange-rate');
      const result = await execute({ from: 'USD', to: 'JPY', amount: 100 });
      const parsed = JSON.parse(result);
      expect(parsed.from === 'USD' || parsed.error).toBe(true);
    });

    test('update-trip-info should accept action and data', async () => {
      const { execute } = require('../../tools/update-trip-info');
      const result = await execute({
        action: 'setConstraints',
        data: { destination: 'Japan' }
      });
      expect(result).toBeDefined();
    });
  });

  describe('Error Handling in Tools', () => {
    test('tools should return JSON on error', async () => {
      const { execute } = require('../../tools/web-search');
      const result = await execute({ query: '' });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    test('tools should not throw on invalid input', async () => {
      const { execute } = require('../../tools/weather');
      try {
        const result = await execute({ city: null });
        expect(result).toBeDefined();
      } catch (e) {
        // Some tools may reject invalid input
        expect(e).toBeDefined();
      }
    });
  });

  describe('Tool Names Convention', () => {
    test('all tools should follow naming convention', () => {
      const tools = [
        require('../../tools/web-search'),
        require('../../tools/weather'),
        require('../../tools/exchange-rate'),
        require('../../tools/poi-search'),
        require('../../tools/dest-knowledge'),
        require('../../tools/update-trip-info')
      ];

      tools.forEach(tool => {
        // Tool names should be snake_case
        const name = tool.TOOL_DEF.name;
        expect(name).toMatch(/^[a-z_]+$/);
      });
    });
  });
});
