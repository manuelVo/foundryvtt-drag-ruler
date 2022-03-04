/**
 * A combination queue/set where the elements are ordered (in ascending order, according to the given priority function)
 * and unique (according to the given elementMatcher).
 * 
 * If an element is added to the set and an equivalent element already exists, the lower-priority one is discarded.
 */
export class PriorityQueueSet {
	constructor(elementMatcher, priorityFunction) {
		this.first = null;
		this.elementMatcher = elementMatcher;
		this.priorityFunction = priorityFunction;
	}

	pushWithPriority(value) {
		const newNode = {value, priority: this.priorityFunction(value), next: null};

		// If the queue is currently empty, we can just set this new node as the first and we're done
		if (!this.first) {
			this.first = newNode;
			return;
		}

		let inserted = false;
		let previous;
		let current = this.first;

		// Loop through the existing elements
		while (current) {
			if (this.elementMatcher(current.value, value)) {
				// We've found an equivalent element before one with a lower priority. This one has at least
				// the same priority as the new one, so don't bother inserting
				return;
			} else if (newNode.priority <= current.priority) {
				// We've found some element with lower priority than the new one, so insert the new one just before it
				newNode.next = current;
				if (previous) {
					previous.next = newNode;
				} else {
					this.first = newNode;
				}
				inserted = true;

				previous = current;
				current = current.next;
				break;
			}
			previous = current;
			current = current.next;
		}

		if (inserted) {
			// Go through the rest of the list and try to find an equivalent element to the new one.
			// We know it has higher priority than the new one, so remove it.
			while (current) {
				if (this.elementMatcher(current.value, value)) {
					if (previous) {
						previous.next = current.next;
					} else {
						this.first = current.next;
					}
					return;
				}
				previous = current;
				current = current.next;
			}
		} else {
			// We reached the end of the queue without finding a lower-priority or existing element, so
			// insert the new one at the end
			previous.next = newNode;
		}
	}

	hasNext() {
		return !!this.first;
	}

	pop() {
		const first = this.first;
		this.first = first?.next;
		return first?.value;
	}
}

export class MaxSizeStackSet {
	constructor(maxSize) {
		this.maxSize = maxSize;
		this.clear();
	}

	/**
	 * Add an element to the top of the stack, remove any other elements with the same
	 * value and, if then the stack is too big, remove the bottom
	 */
	push(value) {
		const newNode = {
			value,
			next: this.top,
			previous: null
		}

		// Add the new node to the top
		this.top = newNode;
		this.last ||= newNode;
		this.size++;

		// If the stack was empty, there's nothing more to do
		let currentNode = this.top.next;
		if (currentNode) {
			currentNode.previous = newNode;

			// Remove any instances from the rest of stack where the value is the size
			while (currentNode) {
				if (currentNode.value === value) {
					if (currentNode.previous) currentNode.previous.next = currentNode.next;
					if (currentNode.next) currentNode.next.previous = currentNode.previous;
					if (this.last === currentNode) {
						this.last = currentNode.previous;
					}
					this.size--;
				}
				currentNode = currentNode.next;
			}

			// If the stack is now too big, remove the last node and return its value
			if (this.size > this.maxSize) {
				const valueToRemove = this.last.value;
				this.last = this.last.previous;
				this.last.next = null;
				this.size--;

				return valueToRemove;
			}
		}
	}

	clear() {
		this.first = null;
		this.last = null;
		this.size = 0;
	}
}