# Prompt: write integration tests

```
Context: FlowBoard API tests use Jest 29, ts-jest and Supertest 6 against `app` imported from
api/src/app.ts (never a listening server). They run on real Postgres and Redis in the
flowboard-test Compose project, one file at a time, with tables truncated and Redis flushed
before each test (ADR-008).

Task: write api/tests/<group>.test.ts covering <endpoints>.

Required cases (docs/requirements/flowboard-requirements.md §4):
- Happy path: <list>
- Error paths: <list, e.g. 401 no token, 403 other user's resource, 404 missing, 422 bad UUID / body>

Constraints:
- Create real fixtures with tests/helpers (registerAndLogin, createBoard). Never use fake ids like 'some-uuid'.
- Assert status, success flag, error code and the important data fields.
- Mock only to reach failure branches (e.g. jest.spyOn(redis, 'multi') throwing) and restore the mocks afterwards.
- Routes have no /api prefix in tests.
```

## Verify follow-up

```
Run the suite with --coverage. Which branches in <files> are still uncovered, and which test would
reach each of them?
```
