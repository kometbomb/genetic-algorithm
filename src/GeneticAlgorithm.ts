export interface GeneticAlgorithmConfig<Genotype> {
  /**
   * Population size. Must be greater than zero.
   */
  populationSize: number;
  /**
   * A value between 0 and 1. Affects the probability of mutation vs. crossover.
   */
  crossoverProbability?: number;

  /**
   * Zero fitness values before each generation. Use when will change randomly.
   */
  recalculateFitnessBeforeEachGeneration?: boolean;

  /**
   * Callback functions
   */

  /**
   * Calculate the fitness for genotypes. This can be used to split the workload between mutliple threads.
   * This function will be called at random times when calling the class methods and it does cache the already
   * known fitness values.
   *
   * Note: Negative values are considered invalid/unfavorable and will not be guarantee to the genotype to be
   * selected for next generation.
   *
   * @param genotypes Incoming genotypes.
   * @returns The fitness values in the same order as the input genotypes.
   */
  fitnessFunction(genotypes: Readonly<Genotype>[]): Promise<number[]>;
  /**
   * Mutate a genotype. This should not directly change the incoming value but return a new, changed genotype.
   *
   * @param genotype The genotype to be mutated.
   * @returns A new genotype with any mutations applied.
   */
  mutationFunction(genotype: Readonly<Genotype>): Genotype;
  /**
   * This should return a combination of A and B. Optional, crossover will not happen if not defined.
   *
   * @param a Parent A
   * @param b Parent B
   * @returns A new genotype with features of both A and B
   */
  crossoverFunction?(a: Readonly<Genotype>, b: Readonly<Genotype>): Genotype;
}

interface Rank {
  fitness: number | null;
}

interface DefinitelyRanked {
  fitness: number;
}

interface PossiblyRankedGenotype<Genotype> extends Rank {
  genotype: Genotype;
}

interface RankedGenotype<Genotype> extends DefinitelyRanked {
  genotype: Genotype;
}

export class GeneticAlgorithm<Genotype = any> {
  private population: PossiblyRankedGenotype<Genotype>[];
  private config: GeneticAlgorithmConfig<Genotype>;

  /**
   * Construct a new GeneticAlgorithm. The type parameter is the type of the genotype passed to the callback functions.
   *
   * @param config Initial configuration. Can be changed runtime with .evolve()
   * @param initialPopulation The initial population. If config.populationSize is larger than this value, the rest will be filled with versions of the initial population.
   */
  constructor(config: GeneticAlgorithmConfig<Genotype>, initialPopulation: Genotype[]) {
    if (initialPopulation.length < 1) {
      throw new Error("Initial population has to be given.");
    }
    this.population = initialPopulation.map(genotype => ({ genotype, fitness: null }));
    this.config = this.setConfig(config);
  }

  private setConfig = (config: GeneticAlgorithmConfig<Genotype>) => {
    if (config.populationSize < 2) {
      throw new Error("populationSize has to be greater than one.")
    }

    this.config = { ...config };
    return config;
  }

  private getRankedPopulation = async (recalculateFitness = false): Promise<RankedGenotype<Genotype>[]> => {
    const hasNoFitness: PossiblyRankedGenotype<Genotype>[] = this.population.filter(ranked => typeof ranked.fitness !== "number" || recalculateFitness);
    const hasFitness: RankedGenotype<Genotype>[] = this.population.filter((ranked): ranked is RankedGenotype<Genotype> => typeof ranked.fitness === "number" && !recalculateFitness);

    if (hasNoFitness.length > 0) {
      const fitness = await this.config.fitnessFunction(hasNoFitness.map(ranked => ranked.genotype));

      if (fitness.length !== hasNoFitness.length) {
        throw new Error("fitnessFunction should return as many fitness values as there are input genotypes.");
      }

      // Update the internal population to keep the already calculated fitness values cached

      const rankedPopulation = hasNoFitness.map((ranked, index) => ({ genotype: ranked.genotype, fitness: fitness[index] })).concat(hasFitness);
      this.population = rankedPopulation;
      return rankedPopulation;
    }

    return hasFitness;
  }

  private crossover = (phenotype: Genotype, mate: Genotype): Genotype => {
    return this.config.crossoverFunction!(phenotype, mate);
  }

  private compete = async () => {
    const crossoverProbability = this.config.crossoverProbability !== undefined ? this.config.crossoverProbability : 0.5;
    const nextGeneration: PossiblyRankedGenotype<Genotype>[] = [];

    let rankedPopulation: (RankedGenotype<Genotype> & { accumulatedFitness: number; })[] =
      (await this.getRankedPopulation(!!this.config.recalculateFitnessBeforeEachGeneration))
      .map(item => ({ ...item, accumulatedFitness: 0 }));
    rankedPopulation.sort((a, b) => b.fitness - a.fitness);
    const total = rankedPopulation.reduce((prev, curr) => prev + curr.fitness, 0) || 1;
    let accumulatedFitness = 0;

    rankedPopulation = rankedPopulation.map((genotype) => {
      accumulatedFitness += genotype.fitness / total;
      return { ...genotype, accumulatedFitness };
    });

    const getRandomParent = () => {
      const r = Math.random();
      const genotype = rankedPopulation.find(genotype => genotype.accumulatedFitness >= r);
      if (!genotype) {
        return rankedPopulation[Math.floor(Math.random() * rankedPopulation.length)];
      }
      return genotype;
    }

    while (nextGeneration.length < this.config.populationSize) {
      const a = getRandomParent();

      if (this.config.crossoverFunction && Math.random() < crossoverProbability) {
        const b = getRandomParent();
        // Elitism - keep the originals
        nextGeneration.push(a);
        nextGeneration.push(b);
        nextGeneration.push({ genotype: this.crossover(a.genotype, b.genotype), fitness: null });
      } else {
        // Elitism - keep the original
        nextGeneration.push(a);
        nextGeneration.push({ genotype: this.mutate(a.genotype), fitness: null });
      }
    }

    // Cull back to populationSize
    this.population = nextGeneration.slice(0, this.config.populationSize);
  }

  private mutate = (genotype: Readonly<Genotype>): Genotype => {
    return this.config.mutationFunction(genotype);
  }

  private populate = () => {
    const size = this.population.length;
    while (this.population.length < this.config.populationSize) {
      this.population.push({
        genotype: this.mutate(this.population[Math.floor(Math.random() * size)].genotype),
        fitness: null,
      });
    }
  }

  /**
   * Run for one generation.
   *
   * @param config Optional config to replace the config given to the constructor
   */
  public evolve = async (config?: GeneticAlgorithmConfig<Genotype>) => {
    if (config) {
      this.setConfig(config);
    }
    this.populate();
    await this.compete();
  }

  /**
   * @returns The best ranked genotype with fitness value.
   */
  public bestRanked = async (): Promise<RankedGenotype<Genotype>> => {
    const ranked = (await this.getRankedPopulation()).filter((ranked): ranked is RankedGenotype<Genotype> => typeof ranked.fitness === "number");

    if (ranked.length === 0) {
      throw new Error("Could not find genotypes with a calculated fitness value - did you run .evolve() yet?");
    }

    return ranked.sort((a, b) => b.fitness - a.fitness)[0];
  }

  /**
   * Only valid after running evolve().
   *
   * @returns The best ranked genotype.
   */
  public best = async (): Promise<Genotype> => {
    return (await this.bestRanked()).genotype;
  }

  /**
   * Only valid after running evolve().
   *
   * @returns The best fitness value.
   */
  public bestScore = async (): Promise<number> => {
    return (await this.bestRanked()).fitness;
  }

  /**
   * @returns The full genotype population.
   */
  public getPopulation = (): Genotype[] => {
    return this.population.map(ranked => ranked.genotype);
  }

  /**
   * Only valid after running evolve().
   *
   * @returns The mean fitness value.
   */
  public meanFitness = async (): Promise<number> => {
    const withFitness = (await this.getRankedPopulation()).filter((ranked): ranked is RankedGenotype<Genotype> => ranked.fitness !== null);
    return withFitness.reduce((acc, ranked) => acc + ranked.fitness, 0) / withFitness.length;
  }
}
