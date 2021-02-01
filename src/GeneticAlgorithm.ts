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
  /**
   * This can be used to replace the built-in comparison. The incoming values are the
   * genotype and the previously calculated fitness value. Optional.
   *
   * @param a Compared genotype a
   * @param b Compared genotype b
   * @returns Return boolean whether the fitness of a is considered better than b
   */
  doesAbeatB?(a: RankedGenotype<Genotype>, b: RankedGenotype<Genotype>): boolean;
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
    if (config.populationSize < 1) {
      throw new Error("populationSize has to be greater than zero.")
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

  private static defaultDoesABeatB = (a: DefinitelyRanked, b: DefinitelyRanked) => a.fitness > b.fitness;

  private crossover = (phenotype: Genotype): Genotype => {
    const mate = this.population[Math.floor(Math.random() * this.population.length)];
    return this.config.crossoverFunction!(phenotype, mate.genotype);
  }

  private compete = (rankedPopulation: RankedGenotype<Genotype>[]) => {
    const nextGeneration: PossiblyRankedGenotype<Genotype>[] = [];
    const compare = this.config.doesAbeatB || GeneticAlgorithm.defaultDoesABeatB;
    const crossoverProbability = this.config.crossoverProbability !== undefined ? this.config.crossoverProbability : 0.5;

    for (let p = 0; p < rankedPopulation.length - 1; p += 2) {
      const phenotype = rankedPopulation[p];
      const competitor = rankedPopulation[p + 1];

      nextGeneration.push(phenotype);

      if (compare(phenotype, competitor)) {
        if (!this.config.crossoverFunction || Math.random() > crossoverProbability) {
          nextGeneration.push({ genotype: this.mutate(phenotype.genotype), fitness: null });
        } else {
          nextGeneration.push({ genotype: this.crossover(phenotype.genotype), fitness: null });
        }
      } else {
        nextGeneration.push(competitor);
      }
    }

    this.population = nextGeneration;
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

  private shufflePopulation = () => {
    for (let index = 0; index < this.population.length; ++index) {
      const other = Math.floor(this.population.length * Math.random());
      const [a, b] = [this.population[index], this.population[other]];
      this.population[index] = b;
      this.population[other] = a;
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
    this.shufflePopulation();
    this.compete(await this.getRankedPopulation(!!this.config.recalculateFitnessBeforeEachGeneration));
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
