# Backend Test Harness

This directory hosts the Jest-based test suite for the Express backend (`backend/src`). It mounts the real route handlers while mocking Supabase, email, and queue services so the tests run entirely in memory—no external infrastructure required.

## How to Run

From this folder:

```sh
cd testing
npm install        # first time only
npm test
```

Generate coverage (from the repo root):

```sh
npm --prefix testing test -- --coverage
```

Jest will create a fresh `coverage/` directory each time. Open `coverage/lcov-report/index.html` to view the report in your browser.