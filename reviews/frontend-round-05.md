# Frontend review 5 of 8
Reviewed a41a7bc, active imports only.

Verified and fixed due-today metric (adapter never produced the magic string). Uses backend civic date convention Asia/Calcutta, tested around midnight and missing/resolved/other dates. Converted click-only nav anchors to Router links with real href/aria-current; logo keyboard accessible. Added programmatic form labels, search label, file type hint and visible focus style. Original identity preserved.

Queue no longer calls itself live; last successful refresh time shown with explicit refresh reminder and API errors. Public privacy label no longer calls deliberately hidden location missing. No backend change.

Validation: clean lint/build; programmatic report labels test with create/detail reload; reviewer/public privacy and full lifecycle browser regression; mobile dark screenshot inspected and overflow0. Date boundary unit test passes. No browser performance or screen-reader certification claim.
