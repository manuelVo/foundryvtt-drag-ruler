pub struct WindowIterator<I: Iterator> {
	iterator: I,
	previous: Option<I::Item>,
}

impl<I: Iterator> Iterator for WindowIterator<I>
where
	I::Item: Copy,
{
	type Item = (I::Item, I::Item);

	fn next(&mut self) -> Option<Self::Item> {
		if self.previous.is_none() {
			self.previous = self.iterator.next();
		}
		let current = self.iterator.next();
		if current.is_none() {
			return None;
		}
		let current = current.unwrap();
		let previous = self.previous.unwrap();
		let result = (current, previous);
		self.previous = Some(current);
		Some(result)
	}
}

pub trait Windows<T> {
	fn windows(self) -> WindowIterator<Self>
	where
		Self: Sized + Iterator;
}

impl<I: Iterator> Windows<I> for I {
	fn windows(self) -> WindowIterator<Self>
	where
		Self: Sized + Iterator,
	{
		WindowIterator {
			iterator: self,
			previous: None,
		}
	}
}
