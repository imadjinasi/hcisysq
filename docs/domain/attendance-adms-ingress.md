# ATT-002 — ADMS/iClock Ingress Foundation

**Status:** IMPLEMENTATION

## Tujuan

Menerima fakta punch mentah dari mesin fingerprint ADMS/iClock langsung ke HCIS tanpa bergantung pada runtime, API, database, atau deployment RuangHadir.

Implementasi protocol di-port dari clean-room/proven implementation `imadjinasi/ruanghadir-69075d19`, lalu diadaptasi ke Fastify + PostgreSQL HCIS. Setelah port, source code menjadi bagian dari repository HCIS dan tidak memiliki runtime dependency ke RuangHadir.

## Scope Go 1

- endpoint machine-only `/iclock/*` pada host ingress khusus;
- serial-device registry;
- lossless request journal;
- ATTLOG parser 11 field tab-separated;
- raw attendance event storage;
- stable event deduplication;
- quarantine untuk payload/protocol/data yang tidak dapat diterima;
- ATTLOG transfer cursor;
- ACK hanya setelah persistence transaction commit.

## Non-goals

Go 1 **tidak**:

- memetakan PIN mesin ke employee;
- menulis `attendance_daily_records`;
- menentukan check-in/check-out;
- menyimpulkan terlambat, tidak hadir, jam kerja, overtime, payroll, atau attendance-resolution outcome;
- mengirim user/template/biometric ke mesin;
- mengirim remote command ke mesin;
- menyediakan Admin UI.

Mapping, projection attendance native HCIS, dan UI berada pada Go 2/Go 3.

## Invariant

1. ADMS ingress adalah infrastructure adapter, bukan attendance policy engine.
2. Raw request/event adalah evidence dan bersifat append-only.
3. Unknown serial tidak otomatis membuat device atau memberi akses.
4. Source IP hanya evidence transport; bukan authentication key.
5. Device `disabled`/`quarantined` tidak boleh menghasilkan raw attendance event yang accepted.
6. Exact duplicate event tidak menghasilkan event kedua.
7. Parser mempertahankan leading-zero PIN, raw timestamp, raw line, dan sebelas raw fields.
8. Timestamp device diinterpretasikan menggunakan timezone device; default registry adalah `Asia/Jakarta`.
9. Payload lebih dari 512 KiB tidak diproses sebagai ATTLOG dan dicatat sebagai quarantine bila request berhasil mencapai parser aplikasi.
10. ACK ATTLOG diberikan hanya setelah request journal, event/quarantine, dan cursor durable di database.
11. Failure pada projection masa depan tidak boleh mengubah fakta raw yang sudah durable menjadi retry protocol.

## Host dan routing

Production harus menyediakan dedicated hostname untuk mesin, dikonfigurasi melalui `ADMS_INGRESS_HOST`, misalnya `adms.hcis.example.id`.

Request dengan host lain tidak diperlakukan sebagai ADMS ingress. Hanya namespace `/iclock/*` yang diterima oleh adapter.

## Protocol subset

Go 1 hanya mendukung transport attendance-log yang sudah terbukti pada implementasi sumber:

- `GET /iclock/cdata?...&options=all` untuk options handshake;
- `POST /iclock/cdata?...&table=ATTLOG&Stamp=...` untuk ATTLOG;
- polling `/iclock/getrequest` tetap menghasilkan response aman tanpa command queue.

Handshake mengaktifkan ATTLOG saja dan tidak meminta OPERLOG, photo, user, atau biometric material.

## Data model

### attendance_adms_devices

Registry device eksplisit: serial number, lifecycle, timezone, model/firmware metadata, first/last seen, last IP, dan last successful request.

Lifecycle Go 1:

- `active`
- `disabled`
- `quarantined`

Device tidak dibuat otomatis dari traffic unknown.

### attendance_adms_request_journal

Evidence setiap request yang mencapai ingress: method/path/query, serial candidate hash, safe metadata, body/hash/length, classification, response, timestamps.

### attendance_adms_events

ATTLOG facts lossless: device, source request, stable identity hash, PIN, raw timestamp, parsed timestamp, raw line, 11 raw fields, line hash, received timestamp.

Tidak ada kolom employee, check-in/check-out, late, absence, overtime, atau payroll result pada tabel ini.

### attendance_adms_quarantines

Menyimpan outcome yang tidak aman diproyeksikan, termasuk unknown device, invalid field count/timestamp, future timestamp, unsupported encoding, oversized payload, disabled device, dan exact duplicate.

### attendance_adms_cursors

Satu opaque ATTLOG `Stamp` per device. Cursor berubah dalam transaction yang sama dengan journal/event outcomes.

## Failure behavior

- unknown device: request dijournal, quarantine `UNKNOWN_DEVICE`, tidak membuat event;
- disabled/quarantined device: HTTP 403, request dijournal, quarantine `DEVICE_NOT_ALLOWED`;
- payload > 512 KiB: HTTP 413, quarantine `PAYLOAD_TRUNCATED`, tidak ACK sukses;
- malformed ATTLOG line: request tetap durable, line masuk quarantine dan line valid lain dapat tetap disimpan;
- exact duplicate: tidak menambah event kedua; outcome dicatat `DUPLICATE_EXACT`;
- database transaction gagal: jangan kirim success ACK.

## Security dan privacy

- tidak ada biometric template pada scope ini;
- raw traffic tidak boleh berisi credential aplikasi HCIS;
- metadata header dibatasi dan control character dibersihkan;
- serial candidate disimpan sebagai hash pada request yang belum ter-resolve;
- dedicated host harus dilindungi reverse proxy, request-size policy, TLS bila firmware mendukung, dan network controls sesuai environment;
- data produksi tidak boleh digunakan pada fixture/test.

## Acceptance criteria Go 1

1. Protocol parser memiliki unit test untuk valid ATTLOG, invalid field count, invalid/future timestamp, serial extraction, handshake, ACK, Stamp, dan stable identity.
2. Migration membuat registry, journal, event, quarantine, dan cursor tanpa mengubah `attendance_daily_records`.
3. Request/event/quarantine raw tidak dapat UPDATE/DELETE melalui database role aplikasi.
4. Unknown device tidak menghasilkan attendance event.
5. Active registered device dapat menghasilkan event durable dan ACK setelah commit.
6. Replay exact ATTLOG tidak menggandakan event.
7. Tidak ada code path Go 1 yang menulis `attendance_daily_records`.
8. Tidak ada inference attendance policy pada adapter.
9. Typecheck/lint/test/build harus dijalankan pada environment nyata sebelum Go 1 dinyatakan verified.
10. Production deployment/cutover tetap membutuhkan human approval sesuai engineering workflow.
