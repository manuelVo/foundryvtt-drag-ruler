/**
 * Simple LIFO stack that tracks which element
 */
export class RetraversableStack {
	constructor() {
		this.top = null;
		this.next = null;
	}

	push(value) {
		const newNode = {value, next: this.top};
		if (!this.top) {
			this.next = newNode;
		}
		this.top = newNode;
	}

	getNext() {
		const next = this.next?.value
		this.next = this.next?.next;
		return next;
	}

	hasNext() {
		return !!this.next;
	}

	reset() {
		this.next = this.top;
	}
}

/**
 * An ordered queue where all the elements are unique, according to the equivalencyCheck.
 * On insert, the element will only be added if there is not already a higher-priority equivalent element in the queue.
 * If there is a lower-priority equivalent element in the queue, it will be removed.
 */
 export class UniquePriorityQueue {
	constructor(elementMatcher) {
		this.first = null;
		this.elementMatcher = elementMatcher;
	}

	push(value, priority, tiePriority) {
		const newNode = { value, priority, tiePriority, next: null };

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
			} else if (newNode.priority < current.priority || (newNode.priority === current.priority && newNode.tiePriority < current.tiePriority)) {
				// We've found some element with lower priority than the new one, so insert the new one just before it
				newNode.next = current;
				if (previous) {
					previous.next = newNode;
				} else {
					this.first = newNode;
				}
				inserted = true;
				
                previous = current;
				current = current.next
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
						this.first = current.next
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
