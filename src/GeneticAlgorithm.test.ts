import { GeneticAlgorithm, GeneticAlgorithmConfig } from "./GeneticAlgorithm";

describe("GeneticAlgorithm", () => {
  describe("Error handling", () => {
    it("throws if initial population array length is not greater than zero", () => {
      const dummyConfig: GeneticAlgorithmConfig<undefined> = {
        populationSize: 10,
        fitnessFunction: () => Promise.resolve([0]),
        mutationFunction: () => undefined,
      };
      expect(() => new GeneticAlgorithm(dummyConfig, [])).toThrow();
    });

    it("throws if population size parameter is not greater than one", () => {
      const dummyConfig: GeneticAlgorithmConfig<undefined> = {
        populationSize: 1,
        fitnessFunction: () => Promise.resolve([0]),
        mutationFunction: () => undefined,
      };
      expect(() => new GeneticAlgorithm(dummyConfig, [undefined])).toThrow(new Error("populationSize has to be greater than one."));
    });

    it("throws if elitistRatio is not between 0.0 and 1.0", async () => {
      const dummyConfig: GeneticAlgorithmConfig<number> = {
        populationSize: 3,
        elitistRatio: -1,
        fitnessFunction: (genotypes: number[]) => Promise.resolve(new Array(genotypes.length).fill(null)),
        mutationFunction: () => 0,
      };
      await expect(() => new GeneticAlgorithm(dummyConfig, [undefined, undefined])).toThrow(new Error("elititstRatio has to be between 0.0 and 1.0."));
    });

    it("throws if fitness function doesn't return the same count of fitness values as input genotypes", async () => {
      const dummyConfig: GeneticAlgorithmConfig<undefined> = {
        populationSize: 10,
        fitnessFunction: () => Promise.resolve([0, 0, 0]),
        mutationFunction: () => undefined,
      };
      await expect(new GeneticAlgorithm(dummyConfig, [undefined, undefined]).evolve()).rejects.toEqual(
        new Error("fitnessFunction should return as many fitness values as there are input genotypes."),
      );
    });

    it("throws if fitness was not calculated for any genotype before calling bestRanked()", async () => {
      const dummyConfig: GeneticAlgorithmConfig<number> = {
        populationSize: 3,
        fitnessFunction: (genotypes: number[]) => Promise.resolve(new Array(genotypes.length).fill(null)),
        mutationFunction: () => 0,
      };
      await expect(new GeneticAlgorithm(dummyConfig, [undefined, undefined]).bestScore()).rejects.toEqual(
        new Error("Could not find genotypes with a calculated fitness value - did you run .evolve() yet?"),
      );
    });
  });

  describe("Configuration", () => {
    const dummyConfig: GeneticAlgorithmConfig<number> = {
      populationSize: 4,
      fitnessFunction: jest.fn((genotypes: number[]) => Promise.resolve(new Array(genotypes.length).fill(0))),
      mutationFunction: jest.fn((n: number) => n),
      crossoverFunction: jest.fn(() => 0),
    };

    beforeEach(() => jest.clearAllMocks());

    it("should change configuration on the fly", async () => {
      expect.assertions(2);
      const algorithm = new GeneticAlgorithm<number>(dummyConfig, [1]);
      await algorithm.evolve();
      expect(algorithm.getPopulation().length).toBe(4);
      await algorithm.evolve({ ...dummyConfig, populationSize: 10 });
      expect(algorithm.getPopulation().length).toBe(10);
    });

    it("should recalculate fitness if recalculateFitnessBeforeEachGeneration is set", async () => {
      expect.assertions(2);

      // Use elitistRatio = 1.0 to ensure no new genotypes are introduced - this would lead into fitnessFunction being called in any case.

      {
        const algorithm = new GeneticAlgorithm<number>({ ...dummyConfig, elitistRatio: 1.0, recalculateFitnessBeforeEachGeneration: false }, [1, 1, 1, 1]);
        await algorithm.evolve();
        await algorithm.evolve();
        await algorithm.evolve();
        expect(dummyConfig.fitnessFunction).toHaveBeenCalledTimes(1);
      }

      jest.clearAllMocks();

      {
        const algorithm = new GeneticAlgorithm<number>({ ...dummyConfig, elitistRatio: 1.0, recalculateFitnessBeforeEachGeneration: true }, [1, 1, 1, 1]);
        await algorithm.evolve();
        await algorithm.evolve();
        await algorithm.evolve();
        expect(dummyConfig.fitnessFunction).toHaveBeenCalledTimes(3);
      }
    })
  });

  describe("Callbacks", () => {
    const dummyConfig: GeneticAlgorithmConfig<number> = {
      populationSize: 100,
      fitnessFunction: jest.fn((genotypes: number[]) => Promise.resolve(new Array(genotypes.length).fill(0))),
      mutationFunction: jest.fn((n: number) => n),
      crossoverFunction: jest.fn(() => 0),
    };

    beforeEach(() => jest.clearAllMocks());

    it("calls mutationFunction", async () => {
      const algorithm = new GeneticAlgorithm<number>(dummyConfig, new Array(100).fill(0));
      // Ensure crossover probability is 0 %
      await algorithm.evolve({ ...dummyConfig, crossoverProbability: 0.0 });
      expect(dummyConfig.mutationFunction).toHaveBeenCalled();
      expect(dummyConfig.crossoverFunction).not.toHaveBeenCalled();
    });
    it("calls fitnessFunction", async () => {
      const algorithm = new GeneticAlgorithm<number>(dummyConfig, [0]);
      await algorithm.evolve();
      expect(dummyConfig.fitnessFunction).toHaveBeenLastCalledWith(new Array(100).fill(0));
    });
    it("reuses fitness values if genotype was not changed", async () => {
      expect.assertions(6);
      const algorithm = new GeneticAlgorithm<number>({ ...dummyConfig, populationSize: 5, crossoverProbability: 0.0, elitistRatio: 0.4 }, new Array(5).fill(0));
      await algorithm.evolve();
      expect(dummyConfig.fitnessFunction).toHaveBeenLastCalledWith([0, 0, 0, 0, 0]);
      // Should always keep two best values intact and call fitnessFunction for the new three values (elitistRatio = 40 %)
      await algorithm.evolve();
      expect(dummyConfig.fitnessFunction).toHaveBeenLastCalledWith([0, 0, 0]);
      await algorithm.evolve();
      expect(dummyConfig.fitnessFunction).toHaveBeenLastCalledWith([0, 0, 0]);
      expect(dummyConfig.fitnessFunction).toBeCalledTimes(3);

      // .best() should reuse the fitness values as the genomes are not changed
      await algorithm.best();
      await algorithm.best();
      expect(dummyConfig.fitnessFunction).toBeCalledTimes(4);

      // .evolve should have the same fitness values from earlier
      await algorithm.evolve();
      expect(dummyConfig.fitnessFunction).toBeCalledTimes(4);
    });
    it("calls crossoverFunction", async () => {
      const algorithm = new GeneticAlgorithm<number>(dummyConfig, new Array(100).fill(0));
      // Ensure crossover probability is 100 %
      await algorithm.evolve({ ...dummyConfig, crossoverProbability: 1.0 });
      expect(dummyConfig.mutationFunction).not.toHaveBeenCalled();
      expect(dummyConfig.crossoverFunction).toHaveBeenCalled();
    });
  });

  describe("Algorithm", () => {
    it("evolves towards best fitness", async () => {
      const target = 10;
      const algorithm = new GeneticAlgorithm<number>({
        populationSize: 100,
        fitnessFunction: async (genotypes: number[]) => Promise.resolve(genotypes.map(genotype => 1 / (Math.abs(target - genotype) + 1))),
        mutationFunction: (genotype: number) => genotype + Math.random() * 10 - 5,
        crossoverFunction: (a: number, b: number) => (a + b) / 2,
        crossoverProbability: .2,
      }, new Array<number>(5).fill(0));
      for (let i = 0; i < 20; ++i) {
        await algorithm.evolve();
      }
      expect(await algorithm.best()).toBeCloseTo(target, 1);
    });
  })
});
