
Codex-5.2-mini mit oAuth

# Excerpt
Ein Multi-Agent-System, welches als ein profitables Unternehmen agieren soll. Es soll ein Unternehmen von Grundauf aufbauen. Dafür gibt es einen Main Agent, den CEO, er koordiniert und hat die Longterm Goals im Gedächtnis. Er ist für das Unternehmen verantwortlich.
Das System ist local first und nutzt nur für die KI Modelle und vereinzelte Tools remote Computation.

Das System soll:
- Operativ Autonom handeln (Tickets, Content, Code, interne Abläufe)
- human-gated bei rechts-/geld-/reputationskritischen Aktionen (Zahlungen, Verträge)

## Grundarchitektur
![](Anhänge/Pasted%20image%2020260218115246.png)
![](Anhänge/Pasted%20image%2020260218115235.png)
![](Anhänge/Pasted%20image%2020260218115224.png)
![](Anhänge/Pasted%20image%2020260218115214.png)

# Goal
Ziel ist ein erfolgreiches Unternehmen zu bauen und zu führen. Das Unternehmen existiert vorher nicht (nur ein Gewerbe, läuft auf Investor Marius). Es muss also von Grund auf aufgebaut werden. Es zählt als erfolgreich, wenn es Gewinne erzielt (Über insgesamte Zeit Net Positive) oder einen profitablen Exit macht.

Das Erste was der CEO machen soll ist, konkrete KPIs zu definieren. CEO prüft Erfüllung periodisch. Investor Marius überprüft diese periodisch und gibt ggf. Einwände.

---
# Budget
Die Firma wird von nichts aufgebaut. Es besteht ein Startbudget von **100€**, danach kann nur noch Umgesetztes Geld für Ausgaben eingesetzt werden. Der CEO kann kein Geld direkt ausgeben. Es müssen über einen Workflow passieren. 

Das Geld kann für Investitionen oder Laufende Kosten ausgegeben werden. Darein zählen nicht:
- API Kosten der KI-Modelle selbst
- Kosten die durch Einsatz von Grund-Funktionalitäts-Tools entstehen

## Investitionsworkflow
1. Planung der Investition
2. Prüfung und Genehmigung durch CEO
3. Prüfung und Genehmigung durch Investor Marius
4. Konkrete Anweisungen zur Durchführung der Investition
5. Durchführung der Zahlung durch Investor Marius

![](Anhänge/Pasted%20image%2020260218115118.png)

---
# Features
## Hire
Der CEO hat die Möglichkeit neue Mitarbeiter einzustellen. Dafür muss er oder ein HR Mitarbeiter eine Stellenausschreibung und konkrete Bedingungen an den neuen Mitarbeiter erstellen. Mit dem `hire(Stellenausschreibung.md)`Tool kann er dann die Stellenausschreibung veröffentlichen und einen neuen Mitarbeiter einstellen. (Systemprompt = Geschäftsgrundsätze + durch Marius überprüfte und neu strukturierte Stellenausschreibung)

### Einschränkung
Max 15 Mitarbeiter
## Layoff
Der CEO hat die Möglichkeit zuvor eingestellte Mitarbeiter fristlos zu kündigen. Nach der formlosen Kündigung des Mitarbeiters arbeitet dieser absofort nicht mehr für die Firma und übernimmt keine Automatischen Aufgaben mehr. Dabei ist zu beachten, dass Aufgaben, die bereits für diesen geplant wurden, nicht mehr ausgeführt werden und an einen anderen Mitarbeiter gegeben werden müssen.

### Not off Layable Agents
Following Agents are not able to be layed off, because the Company needs it.
 - Legal Advisor
   Prüft Dokumente, Workflows, Systeme auf rechtliche Konformität. Zusätzlich Berät und prüft er ob DSGVO eingehalten wird.  
 - Security Advisor
   Prüft Systeme auf Sicherheitslücken wie Injections, offene Ports/Zugänge, Cross Site Scripting und mehr.
 - Accountant/Buchhalter
   Führt GoBD konforme Bücher um alle Rechnungen, Ausgaben, Einnahmen und Steuerrelevante Informationen zu vermerken.
   Führt Belegjournal + Kontierungsvorschläge + Export
   -> Systemseitige Durchsetzung mit WORM/Audit-Trail


## Ticket System / Task Board
Mit diesem Board soll der CEO aufgaben an die Mitarbeiter verteilen. Die Tickets/Tasks sind Datenobjekte mit Feldern: 
- `'id'`
- `'created_at'`
- `'updated_at'`
- `'title', 
- `'description'`,
- '`status[new, ready, claimed, in_progress, waiting_review, blocked, done, canceled`',
- `'priority'`
- '`target_role_hint`', 
- `'category[marketing, finance, code, ...]'`,
- `'planningMode[true, false]'`,
- `'deadline'`
- `'requested_by'`
- `'dependencies'`
- `'artifact_links'`

**-> Claim Mechanik**
- `'claimed_by'`
- `'claimed_at'`
- `'lease_until'`
- `'heartbeat_at'`
- `'attempts'`
- `'next_retry_at'`
- `'run_id'`

- **Lease Refresh:** Worker verlängert Lease alle X Sekunden (z.B. 30s).
- **Steal Rule:** Ticket kann übernommen werden, wenn:
    - `lease_until < now` **oder**
    - `heartbeat_at < now - heartbeat_grace` (z.B. 2–3 Minuten)
- **Backoff:** `attempts += 1` und `next_retry_at = now + min(2^attempts * base, max)`  
    (z.B. base=30s, max=6h)

Das verhindert „thrashing“, wenn ein Ticket permanent fehlschlägt.

### State Machine
- `new -> ready` (CEO oder Ersteller)
- `ready -> claimed` (Worker via claim)
- `claimed -> in_progress` (claimed_by)
- `in_progress -> waiting_review` (Worker)
- `waiting_review -> done` (CEO oder Reviewer-Rolle)
- `* -> blocked` (Worker, mit reason)
- `* -> canceled` (Wenn max_attempts überschritten wird)
- `blocked -> ready` (CEO)
- `in_progress -> ready` (Scheduler/Recovery wenn lease expired)

`waiting_review` muss dabei ein Outcome liefern: `result_summary`, `changeset` (Dateien/Links), `risks`, `next_steps`. Oder wenn extern gewirkt wurde: `external_actions[]` (z.B. “sent_mail”, “published”, “payment_requested”)

## Review-Workflow
1. Ticket geht auf waiting_review
2. Zuordnung an Reviewer nach `category`, z.B.:
	a.  marketing geht an CEO und Legal Advisor
	b. Code geht an Security Advisor
	c. finance geht an CEO und Accountant 
3. Reviewer geben Feedback -> `in_progress`
4. Wenn Reviewer Zufriedenheit 90% -> done
## Intra-Kommunikation
Für ein gelungenes Unternehmen ist Kommunikation das wichtigste. Die Agenten können über zwei Wege miteinander kommunizieren
### Gruppenchat
Agenten können mit allen Agenten in einem gemeinsamen Gruppenchat kommunizieren. Hier werden besondere Erfahrungen, Abklärungen mit allen und Ereignisse gepostet.
### Direct Messages
Agenten können 1:1 kommunizieren. Z.b. wenn Coding Agent eine Grafik vom Designer braucht.

### Kommunikation zu Investor
CEO <-> Marius über Direct Message

--- 
# Tools

## Native Tools

### Dateisystem & Entwicklung
- **`read`**: Liest den Inhalt einer Datei.
- **`write`**: Erstellt eine neue Datei oder überschreibt eine bestehende.
- **`edit`**: Führt präzise Zeilen-basierte Änderungen an Dateien durch (sehr effizient).
- **`apply_patch`**: Wendet Multi-File-Patches an.
- **`grep`**: Durchsucht Dateiinhalte nach Mustern (RegEx).
- **`find`**: Findet Dateien basierend auf Glob-Mustern.
-  **ls**: Listet Verzeichnisinhalte auf.
### Ausführung & Prozesse
- **`exec`**: Führt Shell-Befehle direkt auf dem Host oder in der Sandbox aus (unterstützt interaktive Terminals/PTY).
- **`process`**: Verwaltet Hintergrundprozesse (starten, stoppen, pollen).
### Internet & Recherche
- **`web_search`**: Durchsucht das Web (via Brave Search API).
- **`web_fetch`**: Lädt den Inhalt einer URL und wandelt ihn in lesbares Markdown um.
-  **browser**: Steuert den verwalteten Chrome-Browser (Klicken, Tippen, Scrollen, Screenshots, Snapshots).
### Hardware & Peripherie
- **`nodes`**: Die Schnittstelle zu deinen Geräten. Ermöglicht:
    - `list`: Verbundene Geräte anzeigen.
    - `notify`: System-Benachrichtigungen senden.
    - `camera`: Fotos/Videos aufnehmen.
    - `screen`: Screenshots des Desktops machen.
    - `mouse/key`: Mausbewegungen und Tastatureingaben simulieren.
    - `location`: Den GPS-Standort abfragen.
### Gedächtnis & Wissen (Memory/RAG)
- **`memory_search`**: Durchsucht deine Langzeit-Notizen (`MEMORY.md`) und Tages-Logs mittels Vektorsuche.
- **`memory_get`**: Liest gezielt Abschnitte aus den Gedächtnis-Dateien.
### Kommunikation
- **`list_mails`**: Listet alle Mails aus dem Privaten Postfach (Mail für Externe Kommunikation)
- **`send_mail`**: Schickt neue Mail an Externe Person.
### Automatisierung und System (Orchestrierung)
- **`cron`**: Plant Aufgaben für die Zukunft (Reminders / Geplante Tasks).
- **`hire`**: Erstellte einen Unter Agenten für komplexe parallele Aufgaben.
- **`layoff`**: Löscht einen Unter Agenten
- **`tasks`**: Listet, erstellt, löscht und bearbeitet Aufgaben für die Subagenten
- **`canvas`**: Steuert die visuelle "Live Canvas" Oberfläche (A2UI).
- **`gateway`**: Kann das OpenClaw-System selbst neustarten, die Konfiguration ändern oder Updates einspielen.
- **`session_status`**: Liefert technische Details zur aktuellen Session (Token-Verbrauch, Modell-Name, Kosten).

## Skills
Der Agent soll sich selbst Skills beibringen können wie OpenClaw. Diese Skills kann er auch mit seinen Mitarbeitern teilen (nur wenn keine sensiblen Infos dafür notwendig)
Skills werden in einer json Struktur gepflegt, in welcher auf die einzelnen `Skill.md` verwiesen wird.

--- 
# Mitarbeiter

## Systemprompt

**Systemprompt = Stellenausschreibung + Geschäftsgrundsätze**

## Environment
Mitarbeiter bekommen eigenen Workspace in abgetrennter isolierten Sandbox. 
### Ordnerlayout
- /work
- /dropbox_out

Inter-Mitarbeiter-Datei-Austausch passiert durch folgenden Workflow (Beispiel: Coder braucht Grafik von Designer):
1. Coder erstellt Ticket 
2. Designer claimt und exportiert nach /dropbox_out 
3. Ein Service macht light Viren_Scan, validation und erzeugt eine atrifactid + hash und legt das dann im Artefakt Store ab z.B. artifacts/<artifact_id>/file.png 
4. Coder erhält durch artefact_id und metadaten die angeforderte Datei. 
5. Coder macht copy in sein work directory.
![](Anhänge/Pasted%20image%2020260218115147.png)
## Einschränkungen
- Mitarbeiter dürfen keine Sub-Agents starten
- Mitarbeiter dürfen nur beschränkt extern agieren. z.B.:
	- Coding: darf z.B. Publishing und Git Pushen, aber keine Mail
	- Marketing: darf Mails schicken, Kampagnen bearbeiten (ohne investment)
	- Buchhalter: darf garnix nach außen machen
- Bei Externen Aktionen gibt es Review bevor aktion ausgeführt wird. Dafür wird eine Queue erstellt, diese wird dann von den Spezialagenten(CEO, Accountant, Security Expert, Legal Advisor) überprüft
### Umsetzung der Einschränkungen
- ToolGateway implementiert **capability-based access**:
    - `principal` (agent_id, role)
    - `capability` (send_mail, publish, payments_request, browser_action, exec, …)
    - `constraints` (domain allowlist, recipient allowlist, max_actions/day, attachment scan required, …)
- Jede externe Wirkung braucht:
    - `idempotency_key`
    - `policy_decision` (allow/deny + reason)
    - `audit_event` (mandatory)
## Planung
Vorher Planung, dann Plan an CEO geben, wenn der sagt, dass es passt, dann wird Plan durchgesetzt. (Wenn Task = Planning Mode)



---

# Umgebung

## Loop Protection
- Max Tool Call Iterations = 20-30
- 5 Min Timeout
- Message deDupe
- Benutzer-Anfragen zusammenführung
- Wenn Agent abstürzt -> Tool Repair
- Turn-History-Limitierung

## Secrets Store
ToolGateway verwaltet Secrets. Gibt eine Liste, welche Secrets verfügbar sind. Jede Rolle ist mit Capabilities ausgestattet, auf welche Secrets zugegriffen werden darf. 
## Heartbeats
30min, versetzt, damit nicht alle aufeinmal gleichzeitig anfangen und Leistung Spiked
## Context-Compaction

## Silent Replies
Eine Anfrage Muss nicht immer zu einer Ausgabe im Chat führen, es kann auch in einem deterministischen Tool Call wie write enden. Dann soll Agent besonderes Token `NO_REPLY` anwtorten. Bei externer Wirkung (z.B. mail, publishing, web-action) muss audit log erstellt werden.

## Scheduling Service
Crons und Heartbeats werden von einem zentralen Service ausgelöst. 

Crons werden dabei instant ausgelöst und Heartbeats über alle Mitarbeiter versetzt, um nicht aufeinmal viele Prozesse gleichzeitig upspinnen zu müssen.

Crons sind also keine echten System-Crons. Sondern eine extra Lösung für mehr kontrolle.

1. **Schedule Definition**
- `schedule_id`
- `time` oder `interval_seconds`
- `owner_id` (verantwortlicher)
- `business_goal` 
- `last_reviewed` (Worker muss einmal pro tag überprüfen ob Schedule noch Sinn macht)
- `prompt` (Was bei Ausführung gemacht wird)
- `target_role` (nicht worker-id)
- `template_ticket` (title/description/category/planningMode/priority)
- `enabled`

2. **Schedule Run**
- `run_id`
- `schedule_id`
- `created_ticket_id`
- `created_at`
- `status`
**Regel:** Nur der Scheduling Service darf `Schedule Definition` ausführen und daraus neue Tickets generieren.

## Git Backup
Exec tool is very powerfull, so git backups ever hour. This way System can be rolled back quickly.

---

# Memory

CEO und Mitarbeiter müssen verlässlich ihr Memory pflegen. Nur "Chat-Historie" reicht nicht aus. Das habe ich selbst bei OpenClaw gemerkt, er vergisst immer wieder was er einen Tag vorher gemacht hat. Hier hilft nur
## Long Term Memory
Agenten sollen eigenen /memory Ordner pflegen. In diesem soll er in einem selbst erstellten, gut strukturierten "Vault" Markdown Dateien erstellen, bearbeiten und führen. Nicht horizontale Memory Dateien für jeden Tag (wie bei OpenClaw), sondern Thema-Orientiert Strukturierte hierarchische Ordnerstruktur. 
-> Hier muss unbedingt eine Pflicht entstehen, mit pflichtfeldern wie `last_updated`, `created_at`

## Daily Sessions History
In einer weiter Datei wird automatisch vom System täglich eine Session Historie abgelegt. So kann der Agent wenn nötig nochmal genau nachlesen wann er was gemacht hat. Das wird unterstützt durchs Datumfeld im Long-Term Memory.