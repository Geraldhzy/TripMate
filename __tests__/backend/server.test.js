// Backend server tests
const { TripBook } = require('../../models/trip-book');

describe('Backend Server Logic', () => {
  describe('TripBook Session Management', () => {
    let sessions;

    beforeEach(() => {
      sessions = new Map();
    });

    test('should create new session with TripBook', () => {
      const sessionId = 'session-123';
      sessions.set(sessionId, new TripBook());
      
      expect(sessions.has(sessionId)).toBe(true);
      expect(sessions.get(sessionId)).toBeInstanceOf(TripBook);
    });

    test('should retrieve existing TripBook session', () => {
      const sessionId = 'session-123';
      const tripBook = new TripBook();
      tripBook.updateConstraints({ destination: { value: 'Japan' } });
      sessions.set(sessionId, tripBook);
      
      const retrieved = sessions.get(sessionId);
      expect(retrieved.constraints.destination).toBeDefined();
    });

    test('should handle multiple concurrent sessions', () => {
      for (let i = 0; i < 10; i++) {
        const tripBook = new TripBook();
        tripBook.updateConstraints({ destination: { value: `Destination ${i}` } });
        sessions.set(`session-${i}`, tripBook);
      }
      
      expect(sessions.size).toBe(10);
      expect(sessions.get('session-5').constraints.destination).toBeDefined();
    });
  });

  describe('Tool Execution Flow', () => {
    let tripBook;

    beforeEach(() => {
      tripBook = new TripBook();
    });

    test('should execute weather tool', () => {
      tripBook.setWeather('Tokyo', {
        city: 'Tokyo',
        current: { temp_c: 20, description: 'Sunny' }
      });
      
      expect(tripBook.dynamic.weather.tokyo).toBeDefined();
      expect(tripBook.dynamic.weather.tokyo.current.temp_c).toBe(20);
    });

    test('should execute flight search tool', () => {
      const flightId = tripBook.addFlightQuote({
        from: 'SFO',
        to: 'NRT',
        airline: 'JAL',
        price_usd: 800
      });
      
      expect(tripBook.dynamic.flightQuotes).toHaveLength(1);
      expect(flightId).toBeDefined();
    });

    test('should execute hotel search tool', () => {
      const hotelId = tripBook.addHotelQuote({
        city: 'Tokyo',
        name: 'Tokyo Hotel',
        price_per_night_usd: 150
      });
      
      expect(tripBook.dynamic.hotelQuotes).toHaveLength(1);
      expect(hotelId).toBeDefined();
    });

    test('should execute web search tool', () => {
      tripBook.addWebSearch({
        query: 'Tokyo temples',
        results: 5
      });
      
      expect(tripBook.dynamic.webSearches).toHaveLength(1);
    });

    test('should sync tool results to TripBook', () => {
      tripBook.setWeather('Tokyo', { city: 'Tokyo', current: { temp_c: 20 } });
      tripBook.setExchangeRate('JPY/USD', 0.0067);
      tripBook.addFlightQuote({ from: 'SFO', to: 'NRT', price_usd: 800 });
      
      const panelData = tripBook.toPanelData();
      expect(panelData.weather).toBeDefined();
      expect(panelData.flights).toBeDefined();
    });
  });

  describe('Data Flow', () => {
    let tripBook;

    beforeEach(() => {
      tripBook = new TripBook();
    });

    test('should export panel data structure', () => {
      tripBook.updateConstraints({
        destination: { value: 'Japan' },
        dates: { start: '2026-05-01', end: '2026-05-08', days: 8 }
      });
      
      const panelData = tripBook.toPanelData();
      expect(panelData).toBeDefined();
      expect(panelData.destination).toBeDefined();
      expect(panelData.dates).toBeDefined();
      expect(panelData.days).toBe(8);
    });

    test('should export itinerary updates', () => {
      tripBook.updateItinerary({
        route: ['Tokyo', 'Kyoto', 'Osaka'],
        days: [
          { day: 1, city: 'Tokyo', segments: ['arrival'] },
          { day: 2, city: 'Tokyo', segments: ['sightseeing'] }
        ]
      });
      
      const panelData = tripBook.toPanelData();
      expect(panelData.route).toHaveLength(3);
    });

    test('should combine multi-layer updates', () => {
      tripBook.setWeather('Tokyo', { city: 'Tokyo', current: { temp_c: 20 } });
      tripBook.addFlightQuote({ from: 'SFO', to: 'NRT', price_usd: 800 });
      tripBook.updateConstraints({ destination: { value: 'Japan' } });
      tripBook.updateItinerary({ route: ['Tokyo', 'Kyoto'] });
      
      const panelData = tripBook.toPanelData();
      expect(panelData.flights).toHaveLength(1);
      expect(panelData.route).toHaveLength(2);
    });
  });

  describe('Persistence and Restoration', () => {
    test('should serialize TripBook to JSON', () => {
      const tripBook = new TripBook();
      tripBook.updateConstraints({ destination: { value: 'Japan' } });
      tripBook.addFlightQuote({ from: 'SFO', to: 'NRT', price_usd: 800 });
      
      const json = tripBook.toJSON();
      expect(json).toBeDefined();
      expect(JSON.stringify(json)).toBeDefined();
    });

    test('should deserialize from JSON', () => {
      const tripBook = new TripBook();
      tripBook.updateConstraints({ destination: { value: 'Japan' } });
      const json = tripBook.toJSON();
      
      const restored = new TripBook();
      Object.assign(restored, json);
      expect(restored.constraints.destination).toBeDefined();
    });

    test('should preserve data through cycles', () => {
      const tripBook = new TripBook();
      tripBook.updateConstraints({
        destination: { value: 'Japan' },
        departCity: { value: 'SFO' }
      });
      tripBook.updateItinerary({ route: ['Tokyo', 'Kyoto'] });
      tripBook.addFlightQuote({ from: 'SFO', to: 'NRT', price_usd: 800 });
      
      const json = tripBook.toJSON();
      const restored = new TripBook();
      Object.assign(restored, json);
      
      const originalData = tripBook.toPanelData();
      const restoredData = restored.toPanelData();
      
      expect(restoredData.flights).toHaveLength(originalData.flights.length);
      expect(restoredData.route).toEqual(originalData.route);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid phase gracefully', () => {
      const tripBook = new TripBook();
      expect(() => {
        tripBook.updatePhase(-1);
      }).not.toThrow();
    });

    test('should handle null results', () => {
      const tripBook = new TripBook();
      tripBook.setWeather('Tokyo', null);
      expect(tripBook.dynamic.weather.tokyo).toBeNull();
    });

    test('should handle malformed updates', () => {
      const tripBook = new TripBook();
      expect(() => {
        tripBook.updateConstraints(null);
      }).not.toThrow();
    });
  });
});
