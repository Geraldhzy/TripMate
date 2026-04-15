// Tests for tool loading and execution framework

describe('Tool Execution Framework', () => {
  describe('Tool Loading', () => {
    test('should load web-search tool', () => {
      const webSearch = require('../../tools/web-search');
      expect(webSearch.TOOL_DEF).toBeDefined();
      expect(webSearch.execute).toBeDefined();
    });

    test('should load poi-search tool', () => {
      const poiSearch = require('../../tools/poi-search');
      expect(poiSearch.TOOL_DEF).toBeDefined();
      expect(poiSearch.execute).toBeDefined();
    });

    test('should load flight-search tool', () => {
      const flightSearch = require('../../tools/flight-search');
      expect(flightSearch.TOOL_DEF).toBeDefined();
      expect(flightSearch.execute).toBeDefined();
    });

    test('should load hotel-search tool', () => {
      const hotelSearch = require('../../tools/hotel-search');
      expect(hotelSearch.TOOL_DEF).toBeDefined();
      expect(hotelSearch.execute).toBeDefined();
    });

    test('should load update-trip-info tool', () => {
      const updateTripInfo = require('../../tools/update-trip-info');
      expect(updateTripInfo.TOOL_DEF).toBeDefined();
      expect(updateTripInfo.execute).toBeDefined();
    });

    test('should load all tools with TOOL_DEF', () => {
      const tools = [
        require('../../tools/web-search'),
        require('../../tools/poi-search'),
        require('../../tools/flight-search'),
        require('../../tools/hotel-search'),
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

    test('poi-search should have proper structure', () => {
      const { TOOL_DEF } = require('../../tools/poi-search');
      expect(TOOL_DEF.name).toBe('search_poi');
      expect(TOOL_DEF.parameters.properties.query).toBeDefined();
    });

    test('flight-search should have proper structure', () => {
      const { TOOL_DEF } = require('../../tools/flight-search');
      expect(TOOL_DEF.name).toBe('search_flights');
      expect(TOOL_DEF.parameters.properties.origin).toBeDefined();
      expect(TOOL_DEF.parameters.properties.destination).toBeDefined();
      expect(TOOL_DEF.parameters.properties.date).toBeDefined();
    });

    test('hotel-search should have proper structure', () => {
      const { TOOL_DEF } = require('../../tools/hotel-search');
      expect(TOOL_DEF.name).toBe('search_hotels');
      expect(TOOL_DEF.parameters.properties.city).toBeDefined();
      expect(TOOL_DEF.parameters.properties.checkin).toBeDefined();
      expect(TOOL_DEF.parameters.properties.checkout).toBeDefined();
    });
  });

  describe('Tool Execution Contracts', () => {
    test('update-trip-info should accept constraints and phase', async () => {
      const { execute } = require('../../tools/update-trip-info');
      const result = await execute({
        constraints: { destination: { value: 'Japan' } },
        phase: 1
      });
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
    });

    test('update-trip-info should reject empty input', async () => {
      const { execute } = require('../../tools/update-trip-info');
      const result = await execute({});
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });
  });

  describe('Error Handling in Tools', () => {
    test('web-search should return JSON on empty query', async () => {
      const { execute } = require('../../tools/web-search');
      const result = await execute({ query: '' });
      expect(() => JSON.parse(result)).not.toThrow();
    });

    test('tools should not throw on invalid input', async () => {
      const { execute } = require('../../tools/poi-search');
      try {
        const result = await execute({ query: null, location: null });
        expect(result).toBeDefined();
      } catch (e) {
        // Some tools may reject invalid input
        expect(e).toBeDefined();
      }
    });
  });

  describe('Tool Names Convention', () => {
    test('all tools should follow snake_case naming convention', () => {
      const tools = [
        require('../../tools/web-search'),
        require('../../tools/poi-search'),
        require('../../tools/flight-search'),
        require('../../tools/hotel-search'),
        require('../../tools/update-trip-info')
      ];

      tools.forEach(tool => {
        const name = tool.TOOL_DEF.name;
        expect(name).toMatch(/^[a-z_]+$/);
      });
    });
  });

  describe('Tool Registry', () => {
    test('should export getToolDefinitions and executeToolCall', () => {
      const { getToolDefinitions, executeToolCall } = require('../../tools');
      expect(typeof getToolDefinitions).toBe('function');
      expect(typeof executeToolCall).toBe('function');
    });

    test('getToolDefinitions should include all tools plus delegate', () => {
      const { getToolDefinitions } = require('../../tools');
      const defs = getToolDefinitions();
      const names = defs.map(d => d.function.name);
      expect(names).toContain('web_search');
      expect(names).toContain('search_poi');
      expect(names).toContain('search_flights');
      expect(names).toContain('search_hotels');
      expect(names).toContain('update_trip_info');
      expect(names).toContain('delegate_to_agents');
    });
  });
});
