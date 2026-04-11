const { TripBook } = require('../../models/trip-book');

describe('TripBook', () => {
  let tripBook;

  beforeEach(() => {
    tripBook = new TripBook();
  });

  describe('Initialization', () => {
    test('should have constraints, dynamic, and itinerary layers', () => {
      expect(tripBook.constraints).toBeDefined();
      expect(tripBook.dynamic).toBeDefined();
      expect(tripBook.itinerary).toBeDefined();
    });

    test('should initialize with empty collections', () => {
      expect(tripBook.dynamic.flightQuotes).toEqual([]);
      expect(tripBook.dynamic.hotelQuotes).toEqual([]);
      expect(tripBook.itinerary.route).toEqual([]);
      expect(tripBook.itinerary.days).toEqual([]);
    });

    test('should initialize phase to 0', () => {
      expect(tripBook.itinerary.phase).toBe(0);
    });
  });

  describe('Layer 2: DynamicData - Weather', () => {
    test('setWeather should store weather for city', () => {
      tripBook.setWeather('Tokyo', {
        city: 'Tokyo',
        current: { temp_c: 20, description: 'Sunny' }
      });
      expect(tripBook.dynamic.weather.tokyo).toBeDefined();
      expect(tripBook.dynamic.weather.tokyo.current.temp_c).toBe(20);
    });

    test('setWeather should support multiple cities', () => {
      tripBook.setWeather('Tokyo', { city: 'Tokyo', current: { temp_c: 20 } });
      tripBook.setWeather('Kyoto', { city: 'Kyoto', current: { temp_c: 18 } });
      expect(Object.keys(tripBook.dynamic.weather).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Layer 2: DynamicData - Exchange Rate', () => {
    test('setExchangeRate should store exchange rates', () => {
      tripBook.setExchangeRate('JPY/USD', 0.0067);
      expect(tripBook.dynamic.exchangeRates['JPY/USD']).toBe(0.0067);
    });

    test('setExchangeRate should handle multiple pairs', () => {
      tripBook.setExchangeRate('JPY/USD', 0.0067);
      tripBook.setExchangeRate('EUR/USD', 1.08);
      expect(Object.keys(tripBook.dynamic.exchangeRates).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Layer 2: DynamicData - Flights', () => {
    test('should have flight quotes array', () => {
      expect(Array.isArray(tripBook.dynamic.flightQuotes)).toBe(true);
    });

    test('addFlightQuote should add flight options', () => {
      tripBook.addFlightQuote({
        from: 'SFO',
        to: 'NRT',
        price_usd: 800,
        duration: '12h'
      });
      expect(tripBook.dynamic.flightQuotes).toHaveLength(1);
      expect(tripBook.dynamic.flightQuotes[0].price_usd).toBe(800);
    });

    test('addFlightQuote should handle multiple quotes', () => {
      tripBook.addFlightQuote({ from: 'SFO', to: 'NRT', price_usd: 800 });
      tripBook.addFlightQuote({ from: 'SFO', to: 'NRT', price_usd: 750 });
      expect(tripBook.dynamic.flightQuotes).toHaveLength(2);
    });

    test('addFlightQuote should return quote ID', () => {
      const id = tripBook.addFlightQuote({ from: 'SFO', to: 'NRT', price_usd: 800 });
      expect(typeof id).toBe('string');
      expect(id.startsWith('f')).toBe(true);
    });
  });

  describe('Layer 2: DynamicData - Hotels', () => {
    test('should have hotel quotes array', () => {
      expect(Array.isArray(tripBook.dynamic.hotelQuotes)).toBe(true);
    });

    test('addHotelQuote should add hotel options', () => {
      tripBook.addHotelQuote({
        city: 'Tokyo',
        name: 'Luxury Hotel',
        price_per_night_usd: 150,
        rating: 4.8
      });
      expect(tripBook.dynamic.hotelQuotes).toHaveLength(1);
      expect(tripBook.dynamic.hotelQuotes[0].name).toBe('Luxury Hotel');
    });

    test('addHotelQuote should handle multiple hotels', () => {
      tripBook.addHotelQuote({ city: 'Tokyo', name: 'Hotel A', price_per_night_usd: 150 });
      tripBook.addHotelQuote({ city: 'Tokyo', name: 'Hotel B', price_per_night_usd: 120 });
      expect(tripBook.dynamic.hotelQuotes).toHaveLength(2);
    });

    test('addHotelQuote should return quote ID', () => {
      const id = tripBook.addHotelQuote({ city: 'Tokyo', name: 'Hotel', price_per_night_usd: 150 });
      expect(typeof id).toBe('string');
      expect(id.startsWith('h')).toBe(true);
    });
  });

  describe('Layer 3: UserConstraints', () => {
    test('should have constraints object', () => {
      expect(tripBook.constraints).toBeDefined();
    });

    test('updateConstraints should set basic constraints', () => {
      tripBook.updateConstraints({
        departCity: 'San Francisco',
        destination: 'Japan',
        dates: { start: '2026-05-01', end: '2026-05-10', days: 10 },
        budget: '$5000',
        people: { count: 2 }
      });
      expect(tripBook.constraints.destination).toBeDefined();
      expect(tripBook.constraints.people).toBeDefined();
    });

    test('updateConstraints should handle preferences', () => {
      tripBook.updateConstraints({
        preferences: { tags: ['museums', 'hiking', 'local food'] }
      });
      expect(tripBook.constraints.preferences).toBeDefined();
    });
  });

  describe('Layer 4: Itinerary', () => {
    test('should have itinerary object', () => {
      expect(tripBook.itinerary).toBeDefined();
    });

    test('updateItinerary should set route', () => {
      tripBook.updateItinerary({
        route: ['Tokyo', 'Kyoto', 'Osaka']
      });
      expect(tripBook.itinerary.route).toEqual(['Tokyo', 'Kyoto', 'Osaka']);
    });

    test('updateItinerary should set daily plans', () => {
      tripBook.updateItinerary({
        days: [
          { day: 1, city: 'Tokyo', segments: ['arrival', 'hotel check-in'] },
          { day: 2, city: 'Tokyo', segments: ['sightseeing'] }
        ]
      });
      expect(tripBook.itinerary.days).toHaveLength(2);
      expect(tripBook.itinerary.days[0].city).toBe('Tokyo');
    });

    test('updateItinerary should set budget summary', () => {
      tripBook.updateItinerary({
        budgetSummary: {
          flights: 800,
          hotels: 1200,
          meals: 500,
          total: 2500
        }
      });
      expect(tripBook.itinerary.budgetSummary.total).toBe(2500);
      expect(tripBook.itinerary.budgetSummary.flights).toBe(800);
    });

    test('updateItinerary should preserve existing segments', () => {
      tripBook.updateItinerary({
        days: [{ day: 1, segments: ['activity 1'] }]
      });
      tripBook.updateItinerary({
        days: [{ day: 1, notes: 'updated' }]
      });
      expect(tripBook.itinerary.days[0].segments).toEqual(['activity 1']);
    });
  });

  describe('Phase Management', () => {
    test('should start at phase 0', () => {
      expect(tripBook.itinerary.phase).toBe(0);
    });

    test('updatePhase should update phase', () => {
      tripBook.updatePhase(2);
      expect(tripBook.itinerary.phase).toBe(2);
    });

    test('should not update to invalid phase', () => {
      const originalPhase = tripBook.itinerary.phase;
      tripBook.updatePhase(10); // Invalid
      expect(tripBook.itinerary.phase).toBe(originalPhase);
    });

    test('should handle all valid phases 0-7', () => {
      for (let phase = 0; phase <= 7; phase++) {
        tripBook.updatePhase(phase);
        expect(tripBook.itinerary.phase).toBe(phase);
      }
    });
  });

  describe('Data Export', () => {
    test('toPanelData should return flattened structure', () => {
      tripBook.updateConstraints({
        destination: 'Japan',
        departCity: 'San Francisco',
        dates: { start: '2026-05-01', end: '2026-05-08', days: 8 }
      });
      tripBook.addFlightQuote({ from: 'SFO', to: 'NRT', price_usd: 800 });
      
      const panelData = tripBook.toPanelData();
      expect(panelData).toBeDefined();
      expect(panelData.destination).toBeDefined();
      expect(panelData.flights).toBeDefined();
    });

    test('toJSON should return complete state', () => {
      tripBook.updateConstraints({
        destination: 'Japan',
        people: { count: 2 }
      });
      
      const json = tripBook.toJSON();
      expect(json).toBeDefined();
      expect(json.constraints).toBeDefined();
      expect(json.dynamic).toBeDefined();
      expect(json.itinerary).toBeDefined();
    });

    test('toPanelData should include required fields', () => {
      tripBook.updateConstraints({
        destination: 'Tokyo',
        departCity: 'SFO',
        dates: { start: '2026-05-01', end: '2026-05-05', days: 5 },
        people: { count: 2 },
        budget: '$3000'
      });
      tripBook.updateItinerary({
        route: ['Tokyo'],
        budgetSummary: { total: 2500 }
      });
      
      const panelData = tripBook.toPanelData();
      expect(panelData.destination).toBeDefined();
      expect(panelData.days).toBe(5);
      expect(panelData.route).toBeDefined();
      expect(panelData.budgetSummary).toBeDefined();
    });
  });

  describe('Data Persistence', () => {
    test('should support JSON serialization', () => {
      tripBook.updateConstraints({
        destination: 'Japan',
        departCity: 'SFO'
      });
      tripBook.updateItinerary({
        route: ['Tokyo', 'Kyoto']
      });
      
      const json = tripBook.toJSON();
      expect(json.constraints.destination).toBeDefined();
      expect(json.itinerary.route).toEqual(['Tokyo', 'Kyoto']);
    });

    test('should restore from JSON', () => {
      tripBook.updateConstraints({
        destination: 'Japan',
        departCity: 'SFO'
      });
      tripBook.updateItinerary({
        route: ['Tokyo', 'Kyoto']
      });
      
      const json = tripBook.toJSON();
      const restored = new TripBook();
      Object.assign(restored, json);
      
      expect(restored.constraints.destination).toBeDefined();
      expect(restored.itinerary.route).toEqual(['Tokyo', 'Kyoto']);
    });
  });

  describe('Web Search Tracking', () => {
    test('addWebSearch should store search queries', () => {
      tripBook.addWebSearch({ query: 'Tokyo temples', results: 5 });
      expect(tripBook.dynamic.webSearches).toHaveLength(1);
    });

    test('addWebSearch should deduplicate by query', () => {
      tripBook.addWebSearch({ query: 'Tokyo temples', results: 5 });
      tripBook.addWebSearch({ query: 'Tokyo temples', results: 10 });
      expect(tripBook.dynamic.webSearches).toHaveLength(1);
      expect(tripBook.dynamic.webSearches[0].results).toBe(10); // Latest update
    });

    test('addWebSearch should ignore empty queries', () => {
      const before = tripBook.dynamic.webSearches.length;
      tripBook.addWebSearch({ query: '', results: 0 });
      expect(tripBook.dynamic.webSearches).toHaveLength(before);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty updates gracefully', () => {
      expect(() => tripBook.updateConstraints({})).not.toThrow();
    });

    test('should handle large numbers of quotes', () => {
      for (let i = 0; i < 100; i++) {
        tripBook.addFlightQuote({
          from: 'SFO',
          to: 'NRT',
          price_usd: 800 + i,
          airline: `Airline ${i}`
        });
      }
      expect(tripBook.dynamic.flightQuotes).toHaveLength(100);
    });

    test('should handle large itineraries', () => {
      const days = Array.from({ length: 30 }, (_, i) => ({
        day: i + 1,
        segments: [`Activity ${i * 2}`, `Activity ${i * 2 + 1}`]
      }));
      tripBook.updateItinerary({ days });
      expect(tripBook.itinerary.days).toHaveLength(30);
    });

    test('should maintain data integrity across updates', () => {
      tripBook.updateConstraints({ destination: 'Japan' });
      const firstJson = tripBook.toJSON();
      
      tripBook.updateConstraints({ departCity: 'SFO' });
      const secondJson = tripBook.toJSON();
      
      expect(secondJson.constraints.destination).toBeDefined();
      expect(secondJson.constraints.departCity).toBeDefined();
    });
  });
});
