package main

import (
	"database/sql"
	"fmt"
	"log"
	"syscall/js"
	"encoding/json"
	"time"
	_ "github.com/danmestas/go-sqlite3-opfs"
	_ "github.com/ncruces/go-sqlite3/driver"
)

var db *sql.DB

type Entry struct {
	ID          int64  `json:"id"`
	Name		string `json:"name"`
	StartedAt   int64  `json:"started_at"`
	EndedAt     int64  `json:"ended_at"`
	CreatedAt   int64  `json:"created_at"`
}

func initConnection(this js.Value, args []js.Value) any {
	var err error
	db, err = sql.Open("sqlite3", "file:track.db?vfs=opfs")
	if err != nil {
		log.Fatal("failed to open db:", err)
	}

	db.SetMaxOpenConns(1)

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS entries (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		name		TEXT,
		started_at  INTEGER NOT NULL,
		ended_at    INTEGER NOT NULL,
		created_at  INTEGER NOT NULL
	)`)
	if err != nil {
		log.Fatal("failed to create table:", err)
	}
	return nil
}

func addEntry(this js.Value, args []js.Value) any {
	payload := args[0].String()
	
	var entry Entry
	if err := json.Unmarshal([]byte(payload), &entry); err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	entry.CreatedAt = time.Now().UnixMilli()
	_, err := db.Exec(`INSERT INTO entries (name, started_at, ended_at, created_at) VALUES (?, ?, ?, ?)`,
		entry.Name,
		entry.StartedAt,
		entry.EndedAt,
		entry.CreatedAt,
	)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return "ok"
}

func getEntries(this js.Value, args []js.Value) any {
	rows, err := db.Query(`SELECT id, name, started_at, ended_at, created_at FROM entries ORDER BY started_at DESC`)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	defer rows.Close()

	entries := []Entry{}
	for rows.Next() {
		var entry Entry
		if err := rows.Scan(&entry.ID, &entry.Name, &entry.StartedAt, &entry.EndedAt, &entry.CreatedAt); err != nil {
			return fmt.Sprintf("error: %v", err)
		}
		entries = append(entries, entry)
	}
	result, err := json.Marshal(entries)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return string(result)
}

func deleteEntry(this js.Value, args []js.Value) any {
	id := args[0].Int()
	_, err := db.Exec(`DELETE FROM entries WHERE id = ?`, id)
	if err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return "ok"
}

func main() {
	js.Global().Set("initConnection", js.FuncOf(initConnection))
	js.Global().Set("addEntry", js.FuncOf(addEntry))
	js.Global().Set("getEntries", js.FuncOf(getEntries))
	js.Global().Set("deleteEntry", js.FuncOf(deleteEntry))
	select {}
}
