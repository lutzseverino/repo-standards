# CSV columns

Print the names of the columns in a CSV file.

Run `csv-columns input.csv`. The command reads the named UTF-8 CSV file
and writes its first row of column names, one per line, to stdout.

If the file cannot be read or has malformed CSV, the command writes an error
message to stderr and exits with status 1.
