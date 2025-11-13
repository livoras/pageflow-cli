# MapReduce Loop Extraction Comprehensive Test Plan

## Test Objectives

Test all combinations of $merge strategies and $unique configurations with both object and array schema formats.

## Test Data Setup

Create a recording with 3 loop iterations that produce similar but slightly different results to test deduplication.

## Test Cases

### Object Schema Tests

#### Test 1: concat + unique(single field)

**Schema:**

```json
{
  "$merge": "concat",
  "$unique": "url",
  "title": ".result h3.t a",
  "url": ".result h3.t a@href",
  "snippet": ".c-abstract"
}
```

**Expected:** All results concatenated, duplicates removed by URL

#### Test 2: flatten + unique(multi-field)

**Schema:**

```json
{
  "$merge": "flatten",
  "$unique": ["title", "url"],
  "title": ".result h3.t a",
  "url": ".result h3.t a@href",
  "snippet": ".c-abstract"
}
```

**Expected:** Nested arrays flattened, duplicates removed by title+url combination

#### Test 3: flatten + unique(multi-field, keep: last)

**Schema:**

```json
{
  "$merge": "flatten",
  "$unique": {
    "by": ["title", "url"],
    "keep": "last"
  },
  "title": ".result h3.t a",
  "url": ".result h3.t a@href",
  "snippet": ".c-abstract"
}
```

**Expected:** Same as Test 2 but keeps last occurrence instead of first

#### Test 4: collect (no unique)

**Schema:**

```json
{
  "$merge": "collect",
  "title": ".result h3.t a",
  "url": ".result h3.t a@href",
  "snippet": ".c-abstract"
}
```

**Expected:** Array of arrays, each iteration's results in separate array

#### Test 5: merge (no unique)

**Schema:**

```json
{
  "$merge": "merge",
  "title": ".result h3.t a",
  "url": ".result h3.t a@href",
  "snippet": ".c-abstract"
}
```

**Expected:** Objects merged together (if results are objects)

### Array Schema Tests

#### Test 6: Array format + concat + unique(single field)

**Schema:**

```json
{
  "$merge": "concat",
  "$unique": "url",
  "items": [
    ".result",
    {
      "title": "h3.t a",
      "url": "h3.t a@href",
      "snippet": ".c-abstract"
    }
  ]
}
```

**Expected:** All results concatenated, duplicates removed by URL

#### Test 7: Array format + flatten + unique(multi-field, keep: last)

**Schema:**

```json
{
  "$merge": "flatten",
  "$unique": {
    "by": ["title", "url"],
    "keep": "last"
  },
  "items": [
    ".result",
    {
      "title": "h3.t a",
      "url": "h3.t a@href",
      "snippet": ".c-abstract"
    }
  ]
}
```

**Expected:** Flattened results, last occurrence kept for duplicates

## Execution Plan

1. Use existing recording 14 (Baidu search with 3-iteration loop)
2. Create 7 extraction templates corresponding to test cases above
3. Execute replay for each extraction template
4. Verify results match expectations
5. Document any discrepancies

## Verification Criteria

- Results should reflect correct merge strategy
- Deduplication should work correctly based on specified fields
- Keep strategy (first/last) should be honored
- Both object and array formats should work identically (except structure)
