use concread::bptree::BptreeMap;

fn main() {
    // Create a new BptreeMap
    let tree = BptreeMap::new();

    // Write to the tree
    {
        let mut write_txn = tree.write();
        write_txn.insert("key1".to_string(), "value1".to_string());
        write_txn.insert("key2".to_string(), "value2".to_string());
        write_txn.insert("key3".to_string(), "value3".to_string());
        write_txn.commit();
    }

    // Open the first read transaction
    let read_txn1 = tree.read();

    // Write again to the tree
    {
        let mut write_txn = tree.write();
        write_txn.insert("key4".to_string(), "value4".to_string());
        write_txn.commit();
    }

    // Read from the first transaction
    println!("Read transaction 1:");
    if let Some(value) = read_txn1.get("key1") {
        println!("key1: {}", value);
    }
    if let Some(value) = read_txn1.get("key2") {
        println!("key2: {}", value);
    }
    if let Some(value) = read_txn1.get("key3") {
        println!("key3: {}", value);
    }
    if let Some(value) = read_txn1.get("key4") {
        println!("key4: {}", value);
    } else {
        println!("key4: not found (as expected)");
    }

    // Open the second read transaction
    let read_txn2 = tree.read();

    // Read from the second transaction
    println!("\nRead transaction 2:");
    if let Some(value) = read_txn2.get("key1") {
        println!("key1: {}", value);
    }
    if let Some(value) = read_txn2.get("key2") {
        println!("key2: {}", value);
    }
    if let Some(value) = read_txn2.get("key3") {
        println!("key3: {}", value);
    }
    if let Some(value) = read_txn2.get("key4") {
        println!("key4: {}", value);
    }
}
