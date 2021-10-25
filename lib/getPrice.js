const getPrice = (books) => {
	if(books.length <= 1 || ){
		return books.length * 8 ;
	}
	if (books.length === 2){
		if (books[0] !== books[1] ){
			let sum = books.length * 8;
			return  sum - sum * 5/100;
		}else {
			return books.length * 8 ;
		}
	}
	if (books.length === 3){
		if (books[0] !== books[1] && books[0] !== books[2] && books[1] !== books[2] ){
			let sum = books.length * 8;
			return  sum - sum * 10/100;
		}else {
			return books.length * 8 ;
		}
	}
	if (books.length === 4){
		if (books[0] !== books[1] && books[0] !== books[2] && books[1] !== books[2] &&
				books[0] !== books[3] && books[1] !== books[3] && books[2] !== books[3]){
			let sum = books.length * 8;
			return  sum - sum * 20/100;
		}else {
			return books.length * 8 ;
		}
	}
};
export default getPrice;
