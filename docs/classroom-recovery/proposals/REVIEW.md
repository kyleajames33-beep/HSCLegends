# Local classroom upgrade review: 2026-10-18

Six upgrade tests pass. Independent review also confirms that the local baseline's catalog result equals the saved structure-only projection, all legacy row values are preserved, and player-only deletion removes its answers/receipts/grants while preserving the room and question set.

Two negative controls detect removing the answer-room consistency FK and blocking evidence DELETE (which breaks legacy room cleanup). The tests use synthetic records only. No live migration has been run.

These results do not establish complete effective-role isolation, external inbound dependencies, ledger retention, native lock/concurrency behavior, hosted auth/issuance, browser hydration or rollback safety. UPDATE-only immutability requires the eventual backend role to lack direct DELETE/TRUNCATE privileges on evidence tables.
