# genetic-algorithm

This is a rewrite or interpretation of sorts of [@panchishin's geneticalalgorithm](https://github.com/panchishin/geneticalgorithm) project. The main difference is that it is written in Typescript and supports asynchronous fitness evaluation (suitable for splitting the evaluation in multiple chunks for multi-threading, AWS Lambdas etc.). The interface is very close to the original and some other annoyances/unused features have been fixed.

## Usage

See `src/examples/weasel.ts` for a simple example.
