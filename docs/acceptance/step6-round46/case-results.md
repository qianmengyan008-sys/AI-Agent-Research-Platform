# 第46轮逐项本地审查结果

共49项，全部通过。非零故障请求被正确拒绝才记为通过；不是把备份失败当备份成功。前6项为通用检查，其后包含2项有效收据正例、33项R1负例、8项R2故障/旧文件保护检查。只使用受控本地mock，不代替真实PG18/Windows验收。

| 检查                                                       | 结果 | 实际证据                                                                                                         |
| ---------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------- |
| PowerShell parser (running engine only, not PS5.1)         | PASS | parse_errors=0                                                                                                   |
| Production PS1 has no UTF8-without-BOM non-ASCII ambiguity | PASS | non_ascii_files=0                                                                                                |
| Native argument roundtrip (running OS only)                | PASS | Spaces, quote, trailing slash, empty string, Unicode; not Windows CRT proof.                                     |
| Child-only PG environment, exit7 and stderr suppression    | PASS | Parent PG sentinel removed only from child; native stderr not returned.                                          |
| Native process timeout                                     | PASS | Disposable local Node process, timeout=1s.                                                                       |
| URL parsing forces strict TLS without connection           | PASS | Invented host and credentials, parser only; no child PG process.                                                 |
| Valid original receipt accepted: uppercase                 | PASS | actual_exit=0; local mock list only                                                                              |
| Valid original receipt accepted: lowercase                 | PASS | actual_exit=0; local mock list only                                                                              |
| Verify rejects empty original SHA256                       | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects whitespace SHA256                           | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects null SHA256                                 | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects short SHA256                                | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects long SHA256                                 | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects non-hex SHA256                              | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects numeric SHA256                              | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects newline SHA256                              | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects missing SHA256                              | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects missing bytes                               | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects null bytes                                  | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects zero bytes                                  | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects negative bytes                              | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects string bytes                                | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects floating bytes                              | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects boolean bytes                               | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects huge bytes                                  | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects missing dump exit                           | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects null dump exit                              | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects wrong dump exit                             | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects string dump exit                            | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects boolean dump exit                           | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects floating dump exit                          | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects missing list exit                           | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects wrong list exit                             | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects string list exit                            | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects size mismatch                               | PASS | actual_exit=1; VERIFY_OK=False; tools_called=False                                                               |
| Verify rejects invalid JSON structure: null                | PASS | actual_exit=1                                                                                                    |
| Verify rejects invalid JSON structure: []                  | PASS | actual_exit=1                                                                                                    |
| Verify rejects invalid JSON structure: 42                  | PASS | actual_exit=1                                                                                                    |
| Verify rejects invalid JSON structure: "not-an-object"     | PASS | actual_exit=1                                                                                                    |
| Verify rejects invalid JSON structure: {                   | PASS | actual_exit=1                                                                                                    |
| Verify rejects mismatching valid-format SHA256             | PASS | actual_exit=1                                                                                                    |
| Receipt failure safely cleaned: partial-write              | PASS | actual_exit=1; final_receipts=0; temporary_receipts=0; dumps=0; old_backup_unchanged=True; cleanup_warning=False |
| Receipt failure safely cleaned: flush                      | PASS | actual_exit=1; final_receipts=0; temporary_receipts=0; dumps=0; old_backup_unchanged=True; cleanup_warning=False |
| Receipt failure safely cleaned: close                      | PASS | actual_exit=1; final_receipts=0; temporary_receipts=0; dumps=0; old_backup_unchanged=True; cleanup_warning=False |
| Receipt failure safely cleaned: publish                    | PASS | actual_exit=1; final_receipts=0; temporary_receipts=0; dumps=0; old_backup_unchanged=True; cleanup_warning=False |
| Receipt write failure leaves no success-looking receipt    | PASS | actual_exit=1; final_receipts=0; temporary_receipts=0; dumps=0; old_backup_unchanged=True; cleanup_warning=False |
| Receipt failure safely cleaned: existing-at-publish        | PASS | actual_exit=1; final_receipts=1; temporary_receipts=0; dumps=0; old_backup_unchanged=True; cleanup_warning=False |
| Receipt failure safely cleaned: existing-before-write      | PASS | actual_exit=1; final_receipts=1; temporary_receipts=0; dumps=0; old_backup_unchanged=True; cleanup_warning=False |
| Receipt failure safely cleaned: cleanup-failure            | PASS | actual_exit=1; final_receipts=0; temporary_receipts=1; dumps=0; old_backup_unchanged=True; cleanup_warning=True  |
