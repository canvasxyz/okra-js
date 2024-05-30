use concread::bptree::{BptreeMap, BptreeMapReadTxn, BptreeMapWriteTxn};
use ouroboros::self_referencing;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Store {
    map: BptreeMap<String, String>
}

#[wasm_bindgen]
impl Store {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Store {
        Store {
            map: BptreeMap::new()
        }
    }

    #[wasm_bindgen]
    pub fn create_read_transaction(self) -> ReadOnlyTransaction {
        ReadOnlyTransaction::new(self.map, |map| map.read())
    }

    #[wasm_bindgen]
    pub fn create_read_write_transaction(self) -> ReadWriteTransaction {
        ReadWriteTransaction::new(self.map, |map| map.write())
    }
}

#[wasm_bindgen]
#[self_referencing(pub_extras)]
pub struct ReadOnlyTransaction {
    map: BptreeMap<String, String>,
    #[borrows(map)]
    #[not_covariant]
    txn: BptreeMapReadTxn<'this, String, String>
}

#[wasm_bindgen]
impl ReadOnlyTransaction {
    pub fn get(&self, key: String) -> Option<String> {
        self.with_txn(|txn| {
            txn.get(&key).cloned()
        })
    }
}

// some duplicate code - can we use traits here?

#[wasm_bindgen]
#[self_referencing(pub_extras)]
pub struct ReadWriteTransaction {
    map: BptreeMap<String, String>,
    #[borrows(mut map)]
    #[not_covariant]
    txn: BptreeMapWriteTxn<'this, String, String>
}

#[wasm_bindgen]
impl ReadWriteTransaction {
    pub fn get(self, key: String) -> Option<String> {
        self.with_txn(|txn| {
            txn.get(&key).cloned()
        })
    }

    pub fn set(mut self, key: String, value: String) {
        self.with_txn_mut(|txn| {
            txn.insert(key, value);
        });
    }

    pub fn commit(mut self) {
        self.with_txn_mut(|txn| {
            txn.commit();
        });
    }
}
