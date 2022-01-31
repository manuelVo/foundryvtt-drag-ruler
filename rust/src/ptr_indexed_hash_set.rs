use rustc_hash::FxHashSet;
use std::collections::hash_set;
use std::hash::{Hash, Hasher};
use std::rc::Rc;

pub struct PtrIndexedHashSet<T>(FxHashSet<PtrIndexedRc<T>>);

impl<T> PtrIndexedHashSet<T> {
	pub fn new() -> Self {
		PtrIndexedHashSet(FxHashSet::default())
	}

	pub fn insert(&mut self, value: Rc<T>) -> bool {
		self.0.insert(PtrIndexedRc(value))
	}

	pub fn remove(&mut self, value: &Rc<T>) -> bool {
		self.0.remove(&PtrIndexedRc(Rc::clone(value)))
	}

	pub fn contains(&mut self, value: &Rc<T>) -> bool {
		self.0.contains(&PtrIndexedRc(Rc::clone(value)))
	}
}

impl<T: std::fmt::Debug> std::fmt::Debug for PtrIndexedHashSet<T> {
	fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
		f.debug_set().entries(self.0.iter().map(|e| &e.0)).finish()
	}
}

struct PtrIndexedRc<T>(Rc<T>);

impl<T> Hash for PtrIndexedRc<T> {
	fn hash<H: Hasher>(&self, state: &mut H) {
		Rc::as_ptr(&self.0).hash(state)
	}
}

impl<T> PartialEq for PtrIndexedRc<T> {
	fn eq(&self, other: &Self) -> bool {
		Rc::ptr_eq(&self.0, &other.0)
	}
}

impl<T> Eq for PtrIndexedRc<T> {}

pub struct PtrIndexedHashSetIterator<'a, T>(hash_set::Iter<'a, PtrIndexedRc<T>>);

impl<'a, T> Iterator for PtrIndexedHashSetIterator<'a, T> {
	type Item = &'a Rc<T>;

	fn next(&mut self) -> Option<Self::Item> {
		match self.0.next() {
			Some(item) => Some(&item.0),
			None => None,
		}
	}
}

impl<'a, T> IntoIterator for &'a PtrIndexedHashSet<T> {
	type Item = &'a Rc<T>;
	type IntoIter = PtrIndexedHashSetIterator<'a, T>;
	fn into_iter(self) -> Self::IntoIter {
		PtrIndexedHashSetIterator::<T>((&self.0).iter())
	}
}
