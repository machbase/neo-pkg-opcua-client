'use strict';

const { EXPRESSION_LIMITS } = require('./limits.js');

const CONSTANTS = {
  PI: Math.PI,
  E: Math.E,
};

const FUNCTIONS = {
  abs: { minArgs: 1, maxArgs: 1, fn: Math.abs },
  ceil: { minArgs: 1, maxArgs: 1, fn: Math.ceil },
  floor: { minArgs: 1, maxArgs: 1, fn: Math.floor },
  round: { minArgs: 1, maxArgs: 1, fn: Math.round },
  trunc: { minArgs: 1, maxArgs: 1, fn: Math.trunc },
  min: { minArgs: 1, maxArgs: EXPRESSION_LIMITS.maxFunctionArgs, fn: Math.min },
  max: { minArgs: 1, maxArgs: EXPRESSION_LIMITS.maxFunctionArgs, fn: Math.max },
  sqrt: { minArgs: 1, maxArgs: 1, fn: Math.sqrt },
  pow: { minArgs: 2, maxArgs: 2, fn: Math.pow },
  sin: { minArgs: 1, maxArgs: 1, fn: Math.sin },
  cos: { minArgs: 1, maxArgs: 1, fn: Math.cos },
  tan: { minArgs: 1, maxArgs: 1, fn: Math.tan },
  asin: { minArgs: 1, maxArgs: 1, fn: Math.asin },
  acos: { minArgs: 1, maxArgs: 1, fn: Math.acos },
  atan: { minArgs: 1, maxArgs: 1, fn: Math.atan },
  log: { minArgs: 1, maxArgs: 1, fn: Math.log },
  log2: { minArgs: 1, maxArgs: 1, fn: Math.log2 },
  log10: { minArgs: 1, maxArgs: 1, fn: Math.log10 },
  exp: { minArgs: 1, maxArgs: 1, fn: Math.exp },
};

function expressionError(message) {
  const err = new Error(message);
  err.userFacing = true;
  return err;
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isUpper(ch) {
  return ch >= 'A' && ch <= 'Z';
}

function isLower(ch) {
  return ch >= 'a' && ch <= 'z';
}

function isIdentChar(ch) {
  return isLower(ch) || isDigit(ch) || ch === '_';
}

function tokenize(expression) {
  const text = String(expression == null ? '' : expression);
  if (!text.trim()) {
    throw expressionError('expression is required');
  }
  if (text.length > EXPRESSION_LIMITS.maxExpressionLength) {
    throw expressionError(`expression length exceeds ${EXPRESSION_LIMITS.maxExpressionLength}`);
  }

  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if ('+-*/%(),'.indexOf(ch) >= 0) {
      tokens.push({ type: ch, value: ch, pos: i });
      i++;
      continue;
    }

    if (ch === '<') {
      const end = text.indexOf('>', i + 1);
      if (end < 0) {
        throw expressionError(`unterminated constant at ${i}`);
      }
      const name = text.slice(i + 1, end);
      if (!Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
        throw expressionError(`unknown constant <${name}>`);
      }
      tokens.push({ type: 'constant', value: name, pos: i });
      i = end + 1;
      continue;
    }

    if (isDigit(ch) || ch === '.') {
      const start = i;
      let hasDigit = false;
      while (i < text.length && isDigit(text[i])) {
        hasDigit = true;
        i++;
      }
      if (text[i] === '.') {
        i++;
        while (i < text.length && isDigit(text[i])) {
          hasDigit = true;
          i++;
        }
      }
      if (!hasDigit) {
        throw expressionError(`invalid number at ${start}`);
      }
      if (text[i] === 'e' || text[i] === 'E') {
        const expStart = i;
        i++;
        if (text[i] === '+' || text[i] === '-') {
          i++;
        }
        let expDigits = false;
        while (i < text.length && isDigit(text[i])) {
          expDigits = true;
          i++;
        }
        if (!expDigits) {
          throw expressionError(`invalid exponent at ${expStart}`);
        }
      }
      const raw = text.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw expressionError(`invalid number ${raw}`);
      }
      tokens.push({ type: 'number', value, raw, pos: start });
      continue;
    }

    if (isUpper(ch)) {
      const start = i;
      i++;
      if (i < text.length && (isUpper(text[i]) || isLower(text[i]) || isDigit(text[i]) || text[i] === '_')) {
        while (i < text.length && (isUpper(text[i]) || isLower(text[i]) || isDigit(text[i]) || text[i] === '_')) {
          i++;
        }
        const raw = text.slice(start, i);
        if (raw === 'PI' || raw === 'E') {
          throw expressionError(`use <${raw}> for constant ${raw}`);
        }
        throw expressionError(`invalid variable '${raw}'`);
      }
      tokens.push({ type: 'variable', value: ch, pos: start });
      continue;
    }

    if (isLower(ch)) {
      const start = i;
      i++;
      while (i < text.length && isIdentChar(text[i])) {
        i++;
      }
      const value = text.slice(start, i);
      tokens.push({ type: 'identifier', value, pos: start });
      continue;
    }

    throw expressionError(`unexpected token '${ch}' at ${i}`);
  }

  if (tokens.length > EXPRESSION_LIMITS.maxTokenCount) {
    throw expressionError(`token count exceeds ${EXPRESSION_LIMITS.maxTokenCount}`);
  }
  tokens.push({ type: 'eof', value: '', pos: text.length });
  return tokens;
}

class Parser {
  constructor(tokens, allowedVariables) {
    this.tokens = tokens;
    this.pos = 0;
    this.allowedVariables = allowedVariables || null;
    this.usedVariables = {};
    this.usedFunctions = {};
    this.usedConstants = {};
  }

  current() {
    return this.tokens[this.pos];
  }

  consume(type) {
    const token = this.current();
    if (token.type !== type) {
      throw expressionError(`expected '${type}' at ${token.pos}`);
    }
    this.pos++;
    return token;
  }

  match(type) {
    if (this.current().type === type) {
      this.pos++;
      return true;
    }
    return false;
  }

  parse() {
    const ast = this.parseAdditive();
    if (this.current().type !== 'eof') {
      throw expressionError(`unexpected token '${this.current().value}' at ${this.current().pos}`);
    }
    const depth = astDepth(ast);
    if (depth > EXPRESSION_LIMITS.maxAstDepth) {
      throw expressionError(`expression depth exceeds ${EXPRESSION_LIMITS.maxAstDepth}`);
    }
    return ast;
  }

  parseAdditive() {
    let node = this.parseMultiplicative();
    while (this.current().type === '+' || this.current().type === '-') {
      const op = this.current().type;
      this.pos++;
      node = { type: 'binary', op, left: node, right: this.parseMultiplicative() };
    }
    return node;
  }

  parseMultiplicative() {
    let node = this.parseUnary();
    while (this.current().type === '*' || this.current().type === '/' || this.current().type === '%') {
      const op = this.current().type;
      this.pos++;
      node = { type: 'binary', op, left: node, right: this.parseUnary() };
    }
    return node;
  }

  parseUnary() {
    if (this.current().type === '+' || this.current().type === '-') {
      const op = this.current().type;
      this.pos++;
      return { type: 'unary', op, expr: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.current();
    if (token.type === 'number') {
      this.pos++;
      return { type: 'number', value: token.value };
    }
    if (token.type === 'constant') {
      this.pos++;
      this.usedConstants[token.value] = true;
      return { type: 'number', value: CONSTANTS[token.value], constant: token.value };
    }
    if (token.type === 'variable') {
      this.pos++;
      if (this.allowedVariables && !this.allowedVariables[token.value]) {
        throw expressionError(`unknown variable '${token.value}'`);
      }
      this.usedVariables[token.value] = true;
      return { type: 'variable', name: token.value };
    }
    if (token.type === 'identifier') {
      this.pos++;
      const name = token.value;
      const spec = FUNCTIONS[name];
      if (!spec) {
        throw expressionError(`unknown function '${name}'`);
      }
      this.consume('(');
      const args = [];
      if (!this.match(')')) {
        do {
          args.push(this.parseAdditive());
          if (args.length > EXPRESSION_LIMITS.maxFunctionArgs) {
            throw expressionError(`function '${name}' has too many arguments`);
          }
        } while (this.match(','));
        this.consume(')');
      }
      if (args.length < spec.minArgs || args.length > spec.maxArgs) {
        throw expressionError(`function '${name}' expects ${spec.minArgs === spec.maxArgs ? spec.minArgs : `${spec.minArgs}-${spec.maxArgs}`} arguments`);
      }
      this.usedFunctions[name] = true;
      return { type: 'call', name, args };
    }
    if (this.match('(')) {
      const node = this.parseAdditive();
      this.consume(')');
      return node;
    }
    throw expressionError(`unexpected token '${token.value}' at ${token.pos}`);
  }
}

function astDepth(node) {
  if (!node) return 0;
  if (node.type === 'binary') {
    return 1 + Math.max(astDepth(node.left), astDepth(node.right));
  }
  if (node.type === 'unary') {
    return 1 + astDepth(node.expr);
  }
  if (node.type === 'call') {
    let max = 0;
    for (const arg of node.args) {
      max = Math.max(max, astDepth(arg));
    }
    return 1 + max;
  }
  return 1;
}

function keys(obj) {
  return Object.keys(obj).sort();
}

function finite(value, label) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw expressionError(`${label || 'value'} is not finite`);
  }
  return num;
}

function evaluateNode(node, values) {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'variable':
      if (!values || !Object.prototype.hasOwnProperty.call(values, node.name)) {
        throw expressionError(`missing variable '${node.name}'`);
      }
      return finite(values[node.name], `variable '${node.name}'`);
    case 'unary': {
      const value = evaluateNode(node.expr, values);
      return node.op === '-' ? -value : value;
    }
    case 'binary': {
      const left = evaluateNode(node.left, values);
      const right = evaluateNode(node.right, values);
      if ((node.op === '/' || node.op === '%') && right === 0) {
        throw expressionError('division by zero');
      }
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '%': return left % right;
        default: throw expressionError(`unknown operator '${node.op}'`);
      }
    }
    case 'call': {
      const spec = FUNCTIONS[node.name];
      const args = node.args.map(arg => evaluateNode(arg, values));
      const result = spec.fn.apply(Math, args);
      if (!Number.isFinite(result)) {
        throw expressionError(`function '${node.name}' returned invalid value`);
      }
      return result;
    }
    default:
      throw expressionError(`unknown node type '${node.type}'`);
  }
}

function findConstantDivision(node) {
  if (!node) return;
  if (node.type === 'binary') {
    findConstantDivision(node.left);
    findConstantDivision(node.right);
    if (node.op === '/' || node.op === '%') {
      const constant = tryEvaluateConstant(node.right);
      if (constant.constant && constant.value === 0) {
        throw expressionError('division by zero');
      }
    }
  } else if (node.type === 'unary') {
    findConstantDivision(node.expr);
  } else if (node.type === 'call') {
    for (const arg of node.args) {
      findConstantDivision(arg);
    }
  }
}

function tryEvaluateConstant(node) {
  if (!node) return { constant: false };
  if (node.type === 'variable') return { constant: false };
  try {
    return { constant: true, value: evaluateNode(node, {}) };
  } catch (_) {
    return { constant: false };
  }
}

function normalizeAllowedVariables(variables) {
  if (!variables) return null;
  const map = {};
  for (const variable of variables) {
    const name = String(variable);
    if (!/^[A-Z]$/.test(name)) {
      throw expressionError(`invalid variable '${name}'`);
    }
    map[name] = true;
  }
  return map;
}

function compile(expression, options) {
  const allowedVariables = normalizeAllowedVariables(options && options.variables);
  const tokens = tokenize(expression);
  const parser = new Parser(tokens, allowedVariables);
  const ast = parser.parse();
  findConstantDivision(ast);

  return {
    expression: String(expression),
    ast,
    usedVariables: keys(parser.usedVariables),
    functions: keys(parser.usedFunctions),
    constants: keys(parser.usedConstants),
    evaluate(values) {
      const result = evaluateNode(ast, values || {});
      if (!Number.isFinite(result)) {
        throw expressionError('expression returned invalid value');
      }
      return result;
    },
  };
}

function validate(expression, options) {
  const compiled = compile(expression, options || {});
  const data = {
    usedVariables: compiled.usedVariables,
    functions: compiled.functions,
    constants: compiled.constants,
  };
  if (options && options.sampleValues) {
    data.result = compiled.evaluate(options.sampleValues);
  }
  return data;
}

module.exports = {
  CONSTANTS,
  FUNCTIONS,
  EXPRESSION_LIMITS,
  compile,
  validate,
};
