'use strict';

const EXPRESSION_LIMITS = {
  maxExpressionLength: 512,
  maxTokenCount: 128,
  maxAstDepth: 32,
  maxFunctionArgs: 8,
  maxDerivedTagsPerCollector: 64,
  maxVariablesPerExpression: 26,
};

module.exports = { EXPRESSION_LIMITS };
