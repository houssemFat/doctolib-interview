import getPrice from "../lib/getPrice";
// params inputs
describe('Basic examples', () => {
	it('returns 0 when book list is empty', () => {
		expect(getPrice([])).toBe(0);
	})

	it('Returns the price for one book ', () => {
		expect(getPrice([1])).toBe(8);
	})

	it('Returns the price for two books ', () => {
		expect(getPrice([1, 1])).toBe(16);
	})

	it('Returns the price for three books ', () => {
		expect(getPrice([1, 1, 1])).toBe(24);
	})

	it('Returns the price for four books ', () => {
		expect(getPrice([1, 1, 1, 1])).toBe(32);
	})

	it('Returns the price for five books ', () => {
		expect(getPrice([1, 1, 1, 1, 1])).toBe(40);
	})

	it('Returns the price for two different books ', () => {
		expect(getPrice([1, 2])).toBe(15.2);
	})
	it('Returns the price for three different books ', () => {
		expect(getPrice([1, 2, 3])).toBe(21.6);
	})
	it('Returns the price for four different books ', () => {
		expect(getPrice([1, 2, 3, 4])).toBe(32 * 0.8);
	})

})
