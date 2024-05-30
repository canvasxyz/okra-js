use concread::bptree::{BptreeMap, BptreeMapReadTxn, BptreeMapWriteTxn};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Store {
    map: &'static BptreeMap<String, String>

}

#[wasm_bindgen]
impl Store {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Store {
        Store {
            // we intentionally 'leak' the reference to the tree
            // this means that its lifetime will be set to static and the data will live
            // for the rest of the program's life
            map: Box::leak(Box::new(BptreeMap::new()))
        }
    }

    #[wasm_bindgen]
    pub fn read(&self) -> ReadOnlyTransaction {
        ReadOnlyTransaction::new(self.map)
    }

    #[wasm_bindgen]
    pub fn write(&self) -> ReadWriteTransaction {
        ReadWriteTransaction::new(self.map)
    }
}

#[wasm_bindgen]
pub struct ReadOnlyTransaction {
    txn: BptreeMapReadTxn<'static, String, String>
}

impl ReadOnlyTransaction {
    pub fn new(map: &'static BptreeMap<String, String>) -> ReadOnlyTransaction {
        ReadOnlyTransaction {
            txn: map.read()
        }
    }
}

#[wasm_bindgen]
impl ReadOnlyTransaction {
    pub fn get(&self, key: String) -> Option<String> {
        self.txn.get(&key).cloned()
    }
}

// some duplicate code - can we use traits here?

#[wasm_bindgen]
pub struct ReadWriteTransaction {
    txn: BptreeMapWriteTxn<'static, String, String>
}

impl ReadWriteTransaction {
    pub fn new(map: &'static BptreeMap<String, String>) -> ReadWriteTransaction {
        ReadWriteTransaction {
            txn: map.write()
        }
    }
}

#[wasm_bindgen]
impl ReadWriteTransaction {
    pub fn get(&self, key: String) -> Option<String> {
        self.txn.get(&key).cloned()
    }

    pub fn set(&mut self, key: String, value: String) {
        self.txn.insert(key, value);
    }

    pub fn delete(&mut self, key: String) {
        self.txn.remove(&key);
    }

    pub fn commit(self) {
        self.txn.commit();
    }
}
