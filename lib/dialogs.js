
const openAnimation = {
	keyframes: [
		{ opacity: 0, transform: "translateY(1em)" },
		{ opacity: 1, transform: "translateY(0)" },
	],
	settings: {
		fill: "forwards",
		duration: 200,
		easing: "ease-out",
	},
};

export class Dialog extends HTMLElement{

	constructor(message){
		super();
		this.message = message;
	}

	#message;
	set message(message){
		if(typeof message === "string"){
			if(this.shadowRoot?.querySelector("p.message")){
				this.shadowRoot.querySelector("p.message").innerText = message;
			}
			this.#message = message;
		}
	}
	get message(){
		return this.#message;
	}

	#isOpen = false;
	get isOpen(){
		return this.#isOpen;
	}

	async open(){
		if(this.isOpen) return false;

		this.#isOpen = true;
		this.style.display = "";
		this.setAttribute("open", "");

		const dialog = this.shadowRoot.querySelector("dialog");
		dialog.show();
		dialog.animate(
			openAnimation.keyframes,
			openAnimation.settings,
		);
		return true;
	}

	async close(){
		if(!this.isOpen) return false;

		const dialog = this.shadowRoot.querySelector("dialog");
		dialog.close();
		const animation = dialog.animate(
			openAnimation.keyframes,
			{
				direction: "reverse",
				...openAnimation.settings,
			},
		);
		await animation.finished;

		this.removeAttribute("open");
		this.style.display = "none";
		this.#isOpen = false;
		return true;
	}

	connectedCallback(){

		this.style.display = "none";

		this.attachShadow({mode: "open"});

		// Putting this in JS is stupid, but there is no native way to import it from an html template file (╯°□°)╯︵ ┻━┻
		const template = `
<style>
	dialog {
		opacity: 0;
		transform: translateY(1em);
		position: fixed;
		display: flex;
		bottom: 2em;
		flex-direction: row;
		justify-content: space-evenly;
		align-items: center;
		gap: .5em;
		padding: .8em 1em .9em 1em;
		border-radius: .3em;
		border: none;
		background-color: rgb(64 64 64);
		box-shadow: 0 .44vw .44vw 0 rgba(0 0 0 / .16), 0 0 0 .22vw rgba(0 0 0 / .08);
		transition: opacity .2s ease-out;
	}
	dialog > * {
		font-family: Helvetica, Arial, sans-serif;
		padding: .4em;
		margin: 0;
		font-size: 1em;
		color: white;
	}
	button{
		background: none;
		border: none;
		cursor: pointer;
	}
	.close {
		padding-top: 0;
		padding-bottom: 0;
	}
</style>
<dialog>
	<p class="message"></p>
	<button class="close" aria-label="Close">🗙</button>
</dialog>
		`;

		this.shadowRoot.innerHTML = template;

		const closeButton = this.shadowRoot.querySelector("button.close");
		closeButton.addEventListener("click", async () => {
			this.close();
		}, { passive: true });

		// Hack to make sure the message is updated
		this.message = this.message;

	}

}

export class InfoDialog extends Dialog{

	constructor(message, timeout){
		super(message);
		this.#timeout = timeout;
	}

	async close(){
		await super.close();
		this.remove();
	}

	#timeout;
	get timeout(){
		return this.#timeout;
	}
	set timeout(timeout){
		if(typeof timeout === "number"){
			this.#timeout = Math.max(timeout, openAnimation.settings.duration);
		}
	}

	connectedCallback(){
		super.connectedCallback();

		if(this.#timeout !== undefined){
			this.open();
			setInterval(async () => {
				this.close();
			}, this.#timeout);
		}
	}

}
