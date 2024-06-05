use std::ops::Range;

use concread::{bptree::{BptreeMap, BptreeMapReadTxn, BptreeMapWriteTxn}, internals::bptree::iter::RangeIter};
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
    txn: *const BptreeMapReadTxn<'static, String, String>
}

impl ReadOnlyTransaction {
    pub fn new(map: &'static BptreeMap<String, String>) -> ReadOnlyTransaction {
        ReadOnlyTransaction {
            txn: Box::into_raw(Box::new(map.read()))
        }
    }
}

#[wasm_bindgen]
impl ReadOnlyTransaction {
    pub fn get(&self, key: String) -> Option<String> {
        let txn = unsafe { & *self.txn };
        txn.get(&key).cloned()
    }

    pub fn entries_range(&self, start: String, end: String) -> ExternalRangeIterator {
        let txn = unsafe { & *self.txn };
        ExternalRangeIterator {
            iter: txn.range(Range { start, end })
        }
    }
}

// some duplicate code - can we use traits here?

#[wasm_bindgen]
pub struct ReadWriteTransaction {
    txn: *mut BptreeMapWriteTxn<'static, String, String>
}

impl ReadWriteTransaction {
    pub fn new(map: &'static BptreeMap<String, String>) -> ReadWriteTransaction {
        ReadWriteTransaction {
            txn: Box::into_raw(Box::new(map.write())),
        }
    }
}

#[wasm_bindgen]
impl ReadWriteTransaction {
    pub fn entries_range(&self, start: String, end: String) -> ExternalRangeIterator {
        let txn = unsafe { & *self.txn };
        ExternalRangeIterator {
            iter: txn.range(Range { start, end })
        }
    }

    pub fn get(&self, key: String) -> Option<String> {
        let txn = unsafe { & *self.txn };
        txn.get(&key).cloned()
    }

    pub fn set(&mut self, key: String, value: String) {
        let txn = unsafe { &mut *self.txn };
        txn.insert(key, value);
    }

    pub fn delete(&mut self, key: String) {
        let txn = unsafe { &mut *self.txn };
        txn.remove(&key);
    }

    pub fn commit(self) {
        // this consumes/drops the pointer
        unsafe {
            Box::from_raw(self.txn).commit();
        }
    }
}

pub type Item = (&'static String, &'static String);

#[wasm_bindgen(getter_with_clone)]
#[derive(Clone)]
pub struct KeyValue {
    pub key: String,
    pub value: String
}

#[wasm_bindgen(getter_with_clone)]
pub struct IteratorResult {
    pub done: bool,
    pub value: Option<KeyValue>
}


#[wasm_bindgen]
pub struct ExternalRangeIterator{
    iter: RangeIter<'static, 'static, String, String>
}

#[wasm_bindgen]
impl ExternalRangeIterator {
    pub fn next(&mut self) -> IteratorResult {
        match self.iter.next() {
            None => IteratorResult { done: true, value: None },
            Some((v1, v2)) => IteratorResult {
                done: false,
                value: Some(KeyValue { key: v1.clone(), value: v2.clone()})
            }
        }
    }
}
