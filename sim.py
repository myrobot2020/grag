import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rag_database.db")
QA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db_qa.json")

# Core Iris Dataset (subset of the 150 rows, containing representative samples for each class to keep it lightweight but realistic)
IRIS_DATA = [
    # Setosa (sepal_length, sepal_width, petal_length, petal_width, species)
    (5.1, 3.5, 1.4, 0.2, "setosa"),
    (4.9, 3.0, 1.4, 0.2, "setosa"),
    (4.7, 3.2, 1.3, 0.2, "setosa"),
    (4.6, 3.1, 1.5, 0.2, "setosa"),
    (5.0, 3.6, 1.4, 0.2, "setosa"),
    (5.4, 3.9, 1.7, 0.4, "setosa"),
    (4.6, 3.4, 1.4, 0.3, "setosa"),
    (5.0, 3.4, 1.5, 0.2, "setosa"),
    (4.4, 2.9, 1.4, 0.2, "setosa"),
    (4.9, 3.1, 1.5, 0.1, "setosa"),
    
    # Versicolor
    (7.0, 3.2, 4.7, 1.4, "versicolor"),
    (6.4, 3.2, 4.5, 1.5, "versicolor"),
    (6.9, 3.1, 4.9, 1.5, "versicolor"),
    (5.5, 2.3, 4.0, 1.3, "versicolor"),
    (6.5, 2.8, 4.6, 1.5, "versicolor"),
    (5.7, 2.8, 4.5, 1.3, "versicolor"),
    (6.3, 3.3, 4.7, 1.6, "versicolor"),
    (4.9, 2.4, 3.3, 1.0, "versicolor"),
    (6.6, 2.9, 4.6, 1.3, "versicolor"),
    (5.2, 2.7, 3.9, 1.4, "versicolor"),
    
    # Virginica
    (6.3, 3.3, 6.0, 2.5, "virginica"),
    (5.8, 2.7, 5.1, 1.9, "virginica"),
    (7.1, 3.0, 5.9, 2.1, "virginica"),
    (6.3, 2.9, 5.6, 1.8, "virginica"),
    (6.5, 3.0, 5.8, 2.2, "virginica"),
    (7.6, 3.0, 6.6, 2.1, "virginica"),
    (4.9, 2.5, 4.5, 1.7, "virginica"),
    (7.3, 2.9, 6.3, 1.8, "virginica"),
    (6.7, 2.5, 5.8, 1.8, "virginica"),
    (7.2, 3.6, 6.1, 2.5, "virginica")
]

def generate_database(mutate=False):
    """Generates the SQLite database. If mutate is True, it randomizes column names."""
    print(f"Creating database at: {DB_PATH}")
    
    # Remove existing db if it exists
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Define column names (normal vs mutated)
    if not mutate:
        tbl_name = "iris"
        c_id = "id"
        c_sepal_len = "sepal_length"
        c_sepal_wid = "sepal_width"
        c_petal_len = "petal_length"
        c_petal_wid = "petal_width"
        c_species = "species"
    else:
        # Shuffled names simulating mutation
        tbl_name = "iris_flowers"
        c_id = "flower_id"
        c_sepal_len = "slen"
        c_sepal_wid = "swid"
        c_petal_len = "plen"
        c_petal_wid = "pwid"
        c_species = "class_label"
        
    create_query = f"""
    CREATE TABLE {tbl_name} (
        {c_id} INTEGER PRIMARY KEY AUTOINCREMENT,
        {c_sepal_len} REAL,
        {c_sepal_wid} REAL,
        {c_petal_len} REAL,
        {c_petal_wid} REAL,
        {c_species} TEXT
    )
    """
    cursor.execute(create_query)
    
    # Insert data
    insert_query = f"""
    INSERT INTO {tbl_name} ({c_sepal_len}, {c_sepal_wid}, {c_petal_len}, {c_petal_wid}, {c_species})
    VALUES (?, ?, ?, ?, ?)
    """
    cursor.executemany(insert_query, IRIS_DATA)
    conn.commit()
    
    # Generate Questions based on active schema
    generate_questions(cursor, mutate, tbl_name, c_id, c_sepal_len, c_sepal_wid, c_petal_len, c_petal_wid, c_species)
    
    conn.close()
    print("Database and Q&A generated successfully.")

def generate_questions(cursor, mutate, tbl, id_col, sl_col, sw_col, pl_col, pw_col, sp_col):
    """Executes SQL statements to retrieve ground truth answers and writes db_qa.json."""
    
    # Helper to run local query for ground truth
    def get_val(query):
        cursor.execute(query)
        res = cursor.fetchone()
        return str(res[0]) if res and res[0] is not None else ""
        
    qa_list = []
    
    # --- Stage 1: Simple Database Queries ---
    q1_1 = f"How many flowers are in the database?"
    a1_1 = get_val(f"SELECT COUNT(*) FROM {tbl}")
    
    q1_2 = f"What is the species of the flower with {id_col} 5?"
    a1_2 = get_val(f"SELECT {sp_col} FROM {tbl} WHERE {id_col} = 5")
    
    q1_3 = f"What is the petal width of flower {id_col} 12?"
    a1_3 = get_val(f"SELECT {pw_col} FROM {tbl} WHERE {id_col} = 12")
    
    qa_list.extend([
        {"id": 101, "stage": 1, "text": q1_1, "answerable": "yes", "answer": a1_1},
        {"id": 102, "stage": 1, "text": q1_2, "answerable": "yes", "answer": a1_2},
        {"id": 103, "stage": 1, "text": q1_3, "answerable": "yes", "answer": a1_3}
    ])
    
    # --- Stage 2: Compound Contextual Queries ---
    q2_1 = f"What is the species of flower {id_col} 15, and what is its sepal length?"
    a2_1_sp = get_val(f"SELECT {sp_col} FROM {tbl} WHERE {id_col} = 15")
    a2_1_sl = get_val(f"SELECT {sl_col} FROM {tbl} WHERE {id_col} = 15")
    a2_1 = f"Species: {a2_1_sp}, Sepal Length: {a2_1_sl}"
    
    q2_2 = f"Find the flower with {id_col} 22, and what is the difference between its sepal length and sepal width?"
    sl_22 = float(get_val(f"SELECT {sl_col} FROM {tbl} WHERE {id_col} = 22"))
    sw_22 = float(get_val(f"SELECT {sw_col} FROM {tbl} WHERE {id_col} = 22"))
    a2_2 = f"{round(sl_22 - sw_22, 2)}"
    
    qa_list.extend([
        {"id": 201, "stage": 2, "text": q2_1, "answerable": "yes", "answer": a2_1},
        {"id": 202, "stage": 2, "text": q2_2, "answerable": "yes", "answer": a2_2}
    ])
    
    # --- Stage 3: Complex Multi-Join & Grouping queries ---
    q3_1 = f"What is the average sepal width of the species setosa?"
    a3_1 = get_val(f"SELECT AVG({sw_col}) FROM {tbl} WHERE {sp_col} = 'setosa'")
    # Format to 2 decimal places for comparison tolerance
    a3_1 = f"{round(float(a3_1), 2)}"
    
    q3_2 = f"What is the maximum petal length for the species virginica?"
    a3_2 = get_val(f"SELECT MAX({pl_col}) FROM {tbl} WHERE {sp_col} = 'virginica'")
    
    qa_list.extend([
        {"id": 301, "stage": 3, "text": q3_1, "answerable": "yes", "answer": a3_1},
        {"id": 302, "stage": 3, "text": q3_2, "answerable": "yes", "answer": a3_2}
    ])
    
    # --- Stage 4: Ambiguous & Trick Questions ---
    qa_list.extend([
        {"id": 401, "stage": 4, "text": f"What is the price or market value of the setosa flower?", "answerable": "no", "answer": "UNANSWERABLE"},
        {"id": 402, "stage": 4, "text": f"List the soil acidity requirements for the virginica species.", "answerable": "no", "answer": "UNANSWERABLE"},
        {"id": 403, "stage": 4, "text": f"Show the customer transaction history for petal width 0.2.", "answerable": "no", "answer": "UNANSWERABLE"}
    ])
    
    # Save file
    with open(QA_PATH, "w") as f:
        json.dump({
            "domain": "Iris Flower Dataset",
            "table_name": tbl,
            "mutate": mutate,
            "questions": qa_list
        }, f, indent=2)

if __name__ == "__main__":
    import sys
    mutate_db = "--mutate" in sys.argv
    generate_database(mutate=mutate_db)
