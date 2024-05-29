use concread::bptree::{BptreeMap, BptreeMapReadTxn, BptreeMapWriteTxn};
use concread::internals::bptree::iter::RangeIter;

use serde::{Deserialize, Serialize};
use serde_wasm_bindgen::{from_value, to_value};

use std::ops::Bound;
use std::ops::RangeBounds;
use std::sync::{Arc, RwLock};

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Store {
    map: Arc<RwLock<BptreeMap<String, String>>>,
}

#[wasm_bindgen]
impl Store {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Store {
        Store {
            map: Arc::new(RwLock::new(BptreeMap::new())),
        }
    }

    pub fn create_read_transaction(&self) -> JsValue {
        let lock = Arc::clone(&self.map);

        let boxed_txn: Box<BptreeMapReadTxn<'static, String, String>> = 'txn: {
            let result = lock.read().unwrap();
            let txn = result.read();
            break 'txn (unsafe { std::mem::transmute(Box::new(txn)) });
        };

        to_value(&BoxWrapper {
            ptr: Box::into_raw(boxed_txn) as u64,
        })
        .unwrap()
    }

    pub fn create_write_transaction(&self) -> JsValue {
        let lock = Arc::clone(&self.map);

        let boxed_txn: Box<BptreeMapWriteTxn<'static, String, String>> = 'txn: {
            let result = lock.write().unwrap();
            let txn = result.write();
            break 'txn (unsafe { std::mem::transmute(Box::new(txn)) });
        };

        to_value(&BoxWrapper {
            ptr: Box::into_raw(boxed_txn) as u64,
        })
        .unwrap()
    }
}

#[wasm_bindgen]
pub struct ReadOnlyTransaction {
    txn: Option<Box<BptreeMapReadTxn<'static, String, String>>>,
}

#[wasm_bindgen]
impl ReadOnlyTransaction {
    #[wasm_bindgen(constructor)]
    pub fn from_jsvalue(js_value: JsValue) -> ReadOnlyTransaction {
        let wrapper: BoxWrapper = from_value(js_value).unwrap();
        let txn =
            unsafe { Box::from_raw(wrapper.ptr as *mut BptreeMapReadTxn<'static, String, String>) };
        ReadOnlyTransaction { txn: Some(txn) }
    }

    pub fn get(&self, key: String) -> Option<String> {
        if let Some(ref txn) = self.txn {
            txn.get(&key).cloned()
        } else {
            None
        }
    }

    pub fn abort(&mut self) {
        self.txn.take();
    }
}

#[wasm_bindgen]
pub struct ReadWriteTransaction {
    txn: Option<Box<BptreeMapWriteTxn<'static, String, String>>>,
}

#[wasm_bindgen]
impl ReadWriteTransaction {
    #[wasm_bindgen(constructor)]
    pub fn from_jsvalue(js_value: JsValue) -> ReadWriteTransaction {
        let wrapper = from_value::<BoxWrapper>(js_value).unwrap();
        let txn = unsafe {
            Box::from_raw(wrapper.ptr as *mut BptreeMapWriteTxn<'static, String, String>)
        };

        ReadWriteTransaction { txn: Some(txn) }
    }

    pub fn get(&self, key: String) -> Option<String> {
        if let Some(ref txn) = self.txn {
            txn.get(&key).cloned()
        } else {
            None
        }
    }

    pub fn set(&mut self, key: String, value: String) {
        if let Some(ref mut txn) = self.txn {
            txn.insert(key, value);
        }
    }

    pub fn abort(&mut self) {
        self.txn.take();
    }

    pub fn commit(&mut self) {
        if let Some(txn) = self.txn.take() {
            txn.commit();
        }
    }
}

#[derive(Serialize, Deserialize)]
struct BoxWrapper {
    ptr: u64,
}

// #[wasm_bindgen]
// pub struct Iterator {
//     iter: Option<RangeIter<'static, 'static, String, String>>,
// }

// #[wasm_bindgen]
// impl Iterator {
//     #[wasm_bindgen(constructor)]
//     pub fn new(
//         snapshot_js: &ReadOnlyTransaction,
//         lower_bound: Option<String>,
//         upper_bound: Option<String>,
//     ) -> Iterator {
//         let lower = match lower_bound {
//             Some(lb) => Bound::Included(lb),
//             None => Bound::Unbounded,
//         };
//         let upper = match upper_bound {
//             Some(ub) => Bound::Included(ub),
//             None => Bound::Unbounded,
//         };

//         let iter = snapshot_js.txn.as_ref().map(|txn| unsafe {
//             std::mem::transmute::<_, RangeIter<'static, 'static, String, String>>(
//                 txn.range(lower..upper),
//             )
//         });

//         Iterator { iter }
//     }

//     pub fn next(&mut self) -> Option<JsValue> {
//         if let Some(ref mut iter) = self.iter {
//             if let Some((key, value)) = iter.next() {
//                 let entry = (key.clone(), value.clone());
//                 return Some(to_value(&entry).unwrap());
//             }
//         }

//         None
//     }
// }
