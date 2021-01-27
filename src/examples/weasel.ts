import { GeneticAlgorithm } from "../GeneticAlgorithm";

/**
 * This is an example of using the GeneticAlgorithm class. It is based
 * on the idea in Dawkins' The Selfish Gene.
 */

const goalString = "me thinks its a weasel";

/**
 * The genotype is an object with just one string inside.
 */
interface Genotype {
  text: string;
}

const compareStrings = (a: string, b: string): number => {
  let matchingChars = 0;

  for (let i = 0; i < a.length && i < b.length; ++i) {
    if (a[i] === b[i]) {
      matchingChars += 1;
    }
  }

  return matchingChars;
}

/**
 * This is used to evaluate the fitness for the genotype. You do the most of the work here.
 * This is asynchronous so you could fork the evaluations into several workers.
 *
 * @param genotypes The genotypes that come in for fitness evaluation
 * @returns {number[]} The fitness values for the genotypes in the same order as input
 */

const fitness = async (genotypes: Genotype[]): Promise<number[]> => {
  return Promise.resolve(genotypes.map(genotype => compareStrings(genotype.text, goalString)));
};

const getRandomChar = (): string => {
  const chars = "abcdefghijklmnopqrstuvwxyz ";
  return chars[Math.floor(Math.random() * chars.length)];
}

/**
 * Mutate the genotype.
 *
 * @param genotype Input genotype
 * @returns The input string mutated by one changed character
 */
const mutation = (genotype: Genotype): Genotype => {
  const position = Math.floor(Math.random() * genotype.text.length);
  return { text: `${genotype.text.slice(0, position)}${getRandomChar()}${genotype.text.slice(position + 1)}` }
}

/**
 * Randomly split both incoming parent genotypes and combine into a new genotype.
 *
 * @param a First parent
 * @param b Second parent
 * @returns The child of the two parents
 */
const crossover = (a: Genotype, b: Genotype): Genotype => {
  const position = Math.floor(Math.random() * a.text.length);
  return { text: `${a.text.slice(0, position)}${b.text.slice(position)}` };
}

/**
 * Start with an empty genotype and a population pool of 400 genotypes.
 */

const algorithm = new GeneticAlgorithm<Genotype>(
  {
    populationSize: 400,
    fitnessFunction: fitness,
    mutationFunction: mutation,
    crossoverFunction: crossover,
  },
  [{ text: "                      " }]
);

const go = async () => {
  /**
   * Run for 500 generations printing out the current best genotype and mean fitness.
   */
  for (let i = 1; i <= 500; ++i) {
    await algorithm.evolve();
    console.log("generation =", i, "best =", await algorithm.best(), "meanFitness =", await algorithm.meanFitness());
  }
}

go();
