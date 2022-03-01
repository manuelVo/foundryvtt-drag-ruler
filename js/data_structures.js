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

/**
 * Queue that will only ever accept a single value once
 */
 export class ProcessOnceQueue {
	constructor() {
		this.first = null;
		this.last = null;
		this.queued = new Set();
	}

	reset() {
		this.first = null;
		this.last = null;
		this.queued.clear();
	}

	push(value) {
		if (this.queued.has(value)) {
			return;
		}
		this.queued.add(value);

		const newNode = {
			value,
			next: null,
			previous: null
		}

		if (!this.first) {
			this.first = newNode;
			this.last = newNode;
		} else {
			this.last.next = newNode;
			newNode.previous = this.last;
			this.last = newNode;
		}
	}

	pop() {
		const node = this.first;
		this.first = node?.next;
		if (!node?.next) {
			this.last = null;
		}
		return node?.value;
	}

	hasNext() {
		return !!this.first;
	}
}
